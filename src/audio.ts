import { type Bufs, makeBufs, Scene } from "./audio/lib";
import { LEVEL, PRESETS, presetFor } from "./audio/scenes";
import { Districts, type StreetEar } from "./audio/street";

/** Where the ear is: a place's key and floor (its name picks the floor's soundscape), or the street. */
export interface SceneOpts {
  /** The floor's name ("Casino · tables, slots"…). */
  name?: string;
  /** On the street: where the ear is (x, z), how close the view is (0 wide map … 1 on foot). */
  x?: number;
  z?: number;
  near?: number;
  night?: boolean;
}

/**
 * The city's soundscape, synthesised with Web Audio (no files to download).
 * On the street: rain on the pavement, a distant city hum, a slow lo-fi synth pad with a soft
 * arpeggio, the little sounds of the street (the konbini door chime, the bus pulling in), and a
 * layer for the district you are in (src/audio/street.ts). Inside a place: that place's own
 * soundscape, by floor (src/audio/scenes.ts), cross-faded in as you walk in or change floor.
 * Browsers only allow sound after a click, so it starts from the HUD's sound button; nothing is
 * built or played before.
 */
export class Soundscape {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private rainGain!: GainNode;
  private rainLP!: BiquadFilterNode;
  private musicGain!: GainNode;
  private sfxGain!: GainNode;
  private streetBus!: GainNode;
  private rainOn = true;
  private crowdGain: GainNode | null = null;
  private trafficGain: GainNode | null = null;
  private lastPiyo = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private ticker: ReturnType<typeof setInterval> | undefined;
  private bufs!: Bufs;
  private analyser: AnalyserNode | null = null;
  /** The place you are in ("street" outside), its floor, and the soundscape playing. */
  private place = "street";
  private floor = 0;
  private placeName = "";
  private preset = "street";
  private scene: Scene | null = null;
  private districts: Districts | null = null;
  private ear: StreetEar = { x: 0, z: 0, near: 1, night: true };
  private lastEar = 0;
  /** How much of the street's rain reaches you (1 outside). */
  private rainIn = 1;
  on = false;

  constructor() {
    if (typeof window === "undefined") return;
    // the places tell us what happens in them
    window.addEventListener("zstreet:colosseum", (e) => {
      const d = (e as CustomEvent<{ type: string; winner?: number }>).detail;
      if (d?.type) this.event(d.type, d);
    });
    window.addEventListener("zstreet:sound", (e) => {
      const d = (e as CustomEvent<{ name: string; arg?: unknown }>).detail;
      if (d?.name) this.event(d.name, d.arg);
    });
    if (import.meta.env?.DEV || location.search.includes("debug")) (window as unknown as Record<string, unknown>).__sound = this;
  }

  async start() {
    if (!this.ctx) this.build();
    await this.ctx!.resume();
    this.on = true;
    this.fade(this.master, 0.9, 1.5);
    this.apply(true);
  }

  stop() {
    if (!this.ctx) return;
    this.on = false;
    this.fade(this.master, 0, 0.6);
    // let the machine rest once it is silent
    const ctx = this.ctx;
    setTimeout(() => {
      if (!this.on && ctx.state === "running") void ctx.suspend();
    }, 900);
  }

  setRain(on: boolean) {
    this.rainOn = on;
    if (this.ctx) this.fade(this.rainGain, on ? 0.55 * this.rainIn : 0, 1.2);
  }

  /**
   * Where the ear is. `key` is a place's key (its floor and floor name choose the soundscape) or
   * "street" (then x/z/near/night choose the district layers). Cheap to call every frame: nothing
   * changes unless the place, the floor or the floor's soundscape does.
   */
  setScene(key: string, floor = 0, opts: SceneOpts = {}) {
    const moved = key !== this.place || floor !== this.floor;
    this.place = key;
    this.floor = floor;
    if (opts.name !== undefined) this.placeName = opts.name;
    if (key === "street") {
      this.ear = { x: opts.x ?? this.ear.x, z: opts.z ?? this.ear.z, near: opts.near ?? this.ear.near, night: opts.night ?? this.ear.night };
    }
    if (!this.ctx || !this.on) return;
    if (moved || this.preset !== this.presetId()) this.apply(false);
    if (key === "street" && this.districts) {
      const now = this.ctx.currentTime;
      const dt = Math.min(1, now - this.lastEar);
      this.lastEar = now;
      this.districts.update(this.ear, dt);
    }
  }

  /** A one-shot in the place you are in: "goal", "hit", "rise", "result", "block", "whistle"… */
  event(name: string, arg?: unknown) {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime + 0.05;
    if (this.place === "street") this.districts?.event(name, arg);
    else this.scene?.on[name]?.(t, arg);
  }

  /** What is playing, for tests: the scene, its layers, the street districts' weights and layers. */
  get debug() {
    let rms = 0;
    if (this.analyser) {
      const d = new Float32Array(this.analyser.fftSize);
      this.analyser.getFloatTimeDomainData(d);
      for (const v of d) rms += v * v;
      rms = Math.sqrt(rms / d.length);
    }
    return {
      on: this.on,
      state: this.ctx?.state ?? "none",
      place: this.place,
      floor: this.floor,
      floorName: this.placeName,
      scene: this.preset,
      layers: this.preset === "street" ? ["rain", "city-hum", "lofi-pad", "street-voices", "traffic"] : (this.scene?.layers ?? []),
      events: Object.keys(this.scene?.on ?? {}),
      districts: this.preset === "street" ? { ...(this.districts?.weights ?? {}) } : {},
      districtLayers: this.preset === "street" ? (this.districts?.layers() ?? {}) : {},
      rain: this.rainIn,
      rms: Math.round(rms * 10000) / 10000,
    };
  }

  private presetId() {
    return this.place === "street" ? "street" : presetFor(this.place, this.floor, this.placeName);
  }

  /** Cross-fade to the soundscape of where the ear is now. */
  private apply(instant: boolean) {
    if (!this.ctx) return;
    const id = this.presetId();
    if (id === this.preset && !instant) return;
    const changed = id !== this.preset;
    this.preset = id;
    const xf = instant ? 0.6 : 1.4;
    if (changed || id === "street") {
      this.scene?.close(xf);
      this.scene = null;
    }
    const p = id === "street" ? null : PRESETS[id];
    if (id === "street") {
      this.fade(this.streetBus, 1, xf);
      this.fade(this.musicGain, 0.32, xf);
      this.rainIn = 1;
    } else {
      this.districts?.closeAll(xf);
      this.fade(this.streetBus, 0, xf);
      this.fade(this.musicGain, 0, xf);
      this.rainIn = p?.rain ?? 0.1;
      if (p && (changed || !this.scene)) {
        const s = new Scene(this.ctx, this.bufs, this.master, id, p.room);
        try {
          p.build(s, { night: this.ear.night, floor: this.floor, name: this.placeName });
        } catch (e) {
          console.warn("sound: scene", id, e);
        }
        s.fade(LEVEL[id] ?? 1, xf);
        this.scene = s;
      }
    }
    // the rain through walls: quieter and duller indoors
    const t = this.ctx.currentTime;
    this.rainLP.frequency.setTargetAtTime(this.rainIn >= 1 ? 16000 : 400 + 3000 * this.rainIn, t, 0.4);
    this.fade(this.rainGain, this.rainOn ? 0.55 * this.rainIn : 0, xf);
  }

  private get indoors() {
    return this.place !== "street";
  }

  /** The two-note konbini door chime. */
  chime() {
    if (!this.on || !this.ctx || this.indoors) return;
    const t = this.ctx.currentTime;
    [1318.5, 1046.5].forEach((f, i) => this.bell(f, t + i * 0.22, 0.6, 0.07));
  }

  /** Air brakes and a low rumble as the bus stops. */
  busArrives() {
    if (!this.on || !this.ctx || this.indoors) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const n = ctx.createBufferSource();
    n.buffer = this.noise(1.2);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 2400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.12, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
    n.connect(hp).connect(g).connect(this.sfxGain);
    n.start(t);
    // a gentle three-note arrival tone, like a station jingle
    [659.3, 830.6, 987.8].forEach((f, i) => this.bell(f, t + 0.5 + i * 0.16, 0.5, 0.05));
  }

  /** A new block: a short departure melody, as Japanese stations play before the doors close. */
  blockMelody(big = false) {
    if (!this.on || !this.ctx) return;
    // inside, each place marks a block its own way (the opening bell on the trading floor…)
    if (this.indoors) return this.event("block", big);
    const t = this.ctx.currentTime + 0.05;
    const notes = big ? [784, 988, 1175, 1568, 1175, 1319, 1568, 1976] : [659.3, 784, 987.8, 880, 1046.5, 987.8];
    notes.forEach((f, i) => this.bell(f, t + i * 0.13, 0.55, 0.045));
  }

  /** An empty block: the bus drives through with nobody aboard, two low falling honks. */
  emptyHorn() {
    if (!this.on || !this.ctx || this.indoors) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.05;
    [
      [311, 294, 0],
      [262, 233, 0.42],
    ].forEach(([f0, f1, at]) => {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(f0, t + at);
      o.frequency.linearRampToValueAtTime(f1, t + at + 0.36);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 900;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t + at);
      g.gain.linearRampToValueAtTime(0.05, t + at + 0.03);
      g.gain.setValueAtTime(0.05, t + at + 0.28);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.4);
      o.connect(lp).connect(g).connect(this.sfxGain);
      o.start(t + at);
      o.stop(t + at + 0.45);
    });
  }

  /** Thunder after the lightning: a crack, then a long low roll. */
  thunder() {
    if (!this.on || !this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.35;
    // through walls only the low roll gets in
    const k = this.indoors ? 0.15 + this.rainIn * 0.85 : 1;
    if (k < 0.2) return;
    const n = ctx.createBufferSource();
    n.buffer = this.noise(3.5, true);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(1800 * k, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + 2.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.32 * k, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.12 * k, t + 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.4);
    n.connect(lp).connect(g).connect(this.sfxGain);
    n.start(t);
  }

  /** The crowd reacts: a short swell of voices (cheer when `up`, a groan otherwise). */
  crowd(up: boolean) {
    if (!this.on || !this.ctx) return;
    // in the stadium: the whole bowl erupts; outside, the district hears it from afar
    if (this.place === "stadium") return this.event("goal", up);
    if (this.indoors) return;
    this.districts?.event("goal", up);
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.1;
    const n = ctx.createBufferSource();
    n.buffer = this.noise(2.2);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(up ? 900 : 520, t);
    bp.frequency.linearRampToValueAtTime(up ? 1500 : 330, t + 1.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2);
    n.connect(bp).connect(g).connect(this.sfxGain);
    n.start(t);
    if (up) [1046.5, 1318.5].forEach((f, i) => this.bell(f, t + 0.2 + i * 0.12, 0.4, 0.03));
  }

  private build() {
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.bufs = makeBufs(ctx);
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.streetBus = ctx.createGain();
    this.streetBus.gain.value = 1;
    this.streetBus.connect(this.master);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.master.connect(this.analyser);
    this.districts = new Districts(ctx, this.bufs, this.streetBus);
    // one clock for every scene's one-shots and music
    this.ticker = setInterval(() => {
      if (!this.on) return;
      this.scene?.tick();
      if (this.place === "street") this.districts?.tick();
    }, 200);
    // a touch of space on everything
    const verb = ctx.createConvolver();
    verb.buffer = this.impulse(2.8);
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    this.master.connect(ctx.destination);
    verb.connect(wet).connect(this.master);
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = this.rainOn ? 0.55 : 0;
    this.rainLP = ctx.createBiquadFilter();
    this.rainLP.type = "lowpass";
    this.rainLP.frequency.value = 16000;
    this.rainGain.connect(this.rainLP).connect(this.master);
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0.32;
    this.sfxGain = ctx.createGain();
    this.sfxGain.gain.value = 0.8;
    for (const g of [this.musicGain, this.sfxGain]) g.connect(this.master);
    this.musicGain.connect(verb);
    this.sfxGain.connect(verb);
    this.rain();
    this.hum();
    this.music();
    this.street();
  }

  /**
   * The street around the camera: a murmur of voices (louder with more people near) and the
   * rumble of passing traffic. Levels come from `ambience`, a few times a second.
   */
  private street() {
    const ctx = this.ctx!;
    // voices: band-passed noise whose loudness wobbles like several conversations at once
    const v = ctx.createBufferSource();
    v.buffer = this.noise(6);
    v.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 620;
    bp.Q.value = 0.9;
    const wobble = ctx.createGain();
    wobble.gain.value = 0.6;
    for (const [f, d] of [
      [0.7, 0.25],
      [1.9, 0.15],
    ]) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = f;
      const depth = ctx.createGain();
      depth.gain.value = d;
      lfo.connect(depth).connect(wobble.gain);
      lfo.start();
    }
    this.crowdGain = ctx.createGain();
    this.crowdGain.gain.value = 0;
    v.connect(bp).connect(wobble).connect(this.crowdGain).connect(this.streetBus);
    v.start();
    // traffic: a low rumble with a little tyre hiss on top
    const t = ctx.createBufferSource();
    t.buffer = this.noise(5, true);
    t.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 420;
    this.trafficGain = ctx.createGain();
    this.trafficGain.gain.value = 0;
    t.connect(lp).connect(this.trafficGain).connect(this.streetBus);
    t.start();
  }

  /**
   * What the camera hears, 0..1 each: people nearby, traffic nearby, and the pedestrian crossing's
   * signal (null when nobody is crossing or it is too far), panned left or right (-1..1).
   */
  ambience(crowd: number, traffic: number, crossing: { level: number; pan: number } | null) {
    if (!this.ctx || !this.on || !this.crowdGain || !this.trafficGain || this.indoors) return;
    const t = this.ctx.currentTime;
    this.crowdGain.gain.setTargetAtTime(crowd * 0.09, t, 0.6);
    this.trafficGain.gain.setTargetAtTime(traffic * 0.22, t, 0.4);
    if (crossing && crossing.level > 0.05 && t - this.lastPiyo > 0.62) {
      this.lastPiyo = t;
      this.piyo(crossing.level, crossing.pan);
    }
  }

  /**
   * A horn, by vehicle: the bus's low two-tone, a taxi's quick double beep, a car's honk, the
   * limousine's deep one, the truck's air horn, the scooter's meep, the police whoop, the metro's
   * chord. `level` 0..1 with the distance, `pan` −1..1, `long` holds it down.
   */
  horn(kind: string, level: number, pan: number, long = false) {
    if (!this.on || !this.ctx || level < 0.03 || this.indoors) return;
    const ctx = this.ctx;
    const out = ctx.createStereoPanner();
    out.pan.value = Math.max(-1, Math.min(1, pan));
    out.connect(this.sfxGain);
    const t0 = ctx.currentTime + 0.02;
    const tone = (freqs: number[], at: number, len: number, type: OscillatorType, vol: number, sweep?: [number, number]) => {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t0 + at);
      g.gain.linearRampToValueAtTime(vol * level, t0 + at + 0.02);
      g.gain.setValueAtTime(vol * level, t0 + at + len - 0.04);
      g.gain.linearRampToValueAtTime(0, t0 + at + len);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 2400;
      g.connect(lp).connect(out);
      for (const f of freqs) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.setValueAtTime(sweep ? sweep[0] : f, t0 + at);
        if (sweep) {
          o.frequency.linearRampToValueAtTime(sweep[1], t0 + at + len / 2);
          o.frequency.linearRampToValueAtTime(sweep[0], t0 + at + len);
        }
        o.connect(g);
        o.start(t0 + at);
        o.stop(t0 + at + len + 0.05);
      }
    };
    const L = long ? 2.4 : 1;
    switch (kind) {
      case "bus":
        tone([233, 294], 0, 0.7 * L, "sawtooth", 0.05);
        break;
      case "truck":
        tone([147, 175, 220], 0, 0.9 * L, "sawtooth", 0.06);
        break;
      case "limo":
        tone([175, 220], 0, 0.6 * L, "sawtooth", 0.05);
        break;
      case "taxi":
        tone([466, 554], 0, 0.12, "square", 0.035);
        tone([466, 554], 0.18, long ? 0.8 : 0.14, "square", 0.035);
        break;
      case "scooter":
        tone([880], 0, 0.09, "square", 0.03);
        tone([880], 0.14, long ? 0.5 : 0.09, "square", 0.03);
        break;
      case "police":
        tone([0], 0, 1.4 * L, "sawtooth", 0.035, [620, 1240]);
        break;
      case "metro":
        tone([311, 392, 466], 0, 1.3, "sawtooth", 0.045);
        break;
      default:
        tone([349, 440], 0, 0.35 * L, "sawtooth", 0.045);
    }
  }

  /** The tram's bell: two dings. */
  tramBell(level: number, pan: number) {
    if (!this.on || !this.ctx || level < 0.03 || this.indoors) return;
    const t = this.ctx.currentTime + 0.02;
    this.bell(1568, t, 0.5, 0.05 * level);
    this.bell(1568, t + 0.28, 0.6, 0.05 * level);
    void pan;
  }

  /** An angry driver: a low "hmph!" and a mutter, through a voice-like filter. */
  grumble(level: number) {
    if (!this.on || !this.ctx || level < 0.03 || this.indoors) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.02;
    for (let i = 0; i < 5; i++) {
      const at = t0 + i * 0.16 + (i ? 0.25 : 0);
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      const f = (i ? 150 : 210) + Math.random() * 40;
      o.frequency.setValueAtTime(f, at);
      o.frequency.linearRampToValueAtTime(f * (i ? 0.85 : 0.7), at + 0.14);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 700 + Math.random() * 300;
      bp.Q.value = 3;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime((i ? 0.1 : 0.16) * level, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.15);
      o.connect(bp).connect(g).connect(this.sfxGain);
      o.start(at);
      o.stop(at + 0.2);
    }
  }

  /** The Japanese crossing signal for the blind: a two-chirp "piyo" (a rising whistle). */
  private piyo(level: number, pan: number) {
    const ctx = this.ctx!;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.sfxGain);
    const t0 = ctx.currentTime + 0.02;
    [0, 0.17].forEach((dt) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(2300, t0 + dt);
      o.frequency.exponentialRampToValueAtTime(3300, t0 + dt + 0.09);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t0 + dt);
      g.gain.linearRampToValueAtTime(0.03 * level, t0 + dt + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.12);
      o.connect(g).connect(p);
      o.start(t0 + dt);
      o.stop(t0 + dt + 0.14);
    });
  }

  /** Rain: two layers of filtered noise (the hiss of the shower, the patter on the ground) plus drips. */
  private rain() {
    const ctx = this.ctx!;
    const layer = (type: BiquadFilterType, freq: number, q: number, gain: number) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise(4, true);
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(f).connect(g).connect(this.rainGain);
      src.start();
      // slow gusts
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07 + Math.random() * 0.05;
      const depth = ctx.createGain();
      depth.gain.value = gain * 0.35;
      lfo.connect(depth).connect(g.gain);
      lfo.start();
    };
    layer("highpass", 3200, 0.5, 0.35);
    layer("bandpass", 900, 0.6, 0.55);
    layer("lowpass", 300, 0.7, 0.4);
    // drips from awnings and gutters
    setInterval(() => {
      if (!this.on || !this.rainOn || this.rainIn < 0.5) return;
      const t = ctx.currentTime;
      for (let i = 0; i < 3; i++) {
        if (Math.random() > 0.5) continue;
        const o = ctx.createOscillator();
        o.type = "sine";
        const f0 = 1800 + Math.random() * 2400;
        o.frequency.setValueAtTime(f0, t + i * 0.09);
        o.frequency.exponentialRampToValueAtTime(f0 * 0.5, t + i * 0.09 + 0.05);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.025, t + i * 0.09);
        g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.06);
        o.connect(g).connect(this.rainGain);
        o.start(t + i * 0.09);
        o.stop(t + i * 0.09 + 0.08);
      }
    }, 280);
  }

  /** The city far away: a low, breathing drone. */
  private hum() {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise(4, true);
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 140;
    const g = ctx.createGain();
    g.gain.value = 0.25;
    src.connect(f).connect(g).connect(this.streetBus);
    src.start();
  }

  /**
   * Music: a minor-key progression on a warm detuned pad, a soft sub bass, and a sparse plucked
   * arpeggio, at 72 bpm. Chords change every two bars; notes are chosen so it never sounds busy.
   */
  private music() {
    const ctx = this.ctx!;
    const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
    // Am9 · Fmaj7 · Cmaj7 · Em7 (in midi notes)
    const chords = [
      [57, 60, 64, 67, 71],
      [53, 57, 60, 64, 67],
      [48, 55, 59, 62, 64],
      [52, 55, 59, 62, 66],
    ];
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1400;
    lp.Q.value = 0.4;
    lp.connect(this.musicGain);
    // a slow filter sweep breathes life into the pad
    const sweep = ctx.createOscillator();
    sweep.frequency.value = 0.03;
    const sweepDepth = ctx.createGain();
    sweepDepth.gain.value = 600;
    sweep.connect(sweepDepth).connect(lp.frequency);
    sweep.start();
    const beat = 60 / 72;
    const bar = beat * 4;
    let next = ctx.currentTime + 0.2;
    let k = 0;
    const schedule = () => {
      // inside (or muted) the pad keeps time without making a sound
      if (!this.on || this.indoors) {
        while (next < ctx.currentTime + 4) {
          next += bar * 2;
          k++;
        }
        return;
      }
      while (next < ctx.currentTime + 4) {
        const chord = chords[k % chords.length];
        const dur = bar * 2;
        // pad: two detuned saws per note, slow attack and release
        for (const n of chord.slice(1)) {
          for (const det of [-7, 7]) {
            const o = ctx.createOscillator();
            o.type = "sawtooth";
            o.frequency.value = midi(n);
            o.detune.value = det;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0, next);
            g.gain.linearRampToValueAtTime(0.018, next + 1.6);
            g.gain.setValueAtTime(0.018, next + dur - 1.2);
            g.gain.linearRampToValueAtTime(0, next + dur + 0.6);
            o.connect(g).connect(lp);
            o.start(next);
            o.stop(next + dur + 0.7);
          }
        }
        // sub bass on the root
        const b = ctx.createOscillator();
        b.type = "sine";
        b.frequency.value = midi(chord[0] - 12);
        const bg = ctx.createGain();
        bg.gain.setValueAtTime(0, next);
        bg.gain.linearRampToValueAtTime(0.09, next + 0.4);
        bg.gain.linearRampToValueAtTime(0, next + dur);
        b.connect(bg).connect(this.musicGain);
        b.start(next);
        b.stop(next + dur + 0.1);
        // arpeggio: eighth notes, about half of them played, up an octave
        for (let i = 0; i < 16; i++) {
          if (Math.random() < 0.45) continue;
          const n = chord[(i * 3 + k) % chord.length] + 12;
          this.pluck(midi(n), next + i * beat * 0.5, 0.035);
        }
        next += dur;
        k++;
      }
    };
    schedule();
    this.timer = setInterval(schedule, 1000);
  }

  private pluck(freq: number, t: number, vol: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(g).connect(this.musicGain);
    o.start(t);
    o.stop(t + 1);
  }

  private bell(freq: number, t: number, len: number, vol: number) {
    const ctx = this.ctx!;
    for (const [mult, v] of [
      [1, 1],
      [2.76, 0.3],
      [5.4, 0.12],
    ]) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = freq * mult;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol * v, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g).connect(this.sfxGain);
      o.start(t);
      o.stop(t + len + 0.05);
    }
  }

  private fade(g: GainNode, to: number, s: number) {
    const t = this.ctx!.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.linearRampToValueAtTime(to, t + s);
  }

  /** White noise, or pink-ish (softer, more like rain) when `pink`. */
  private noise(seconds: number, pink = false) {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(2, ctx.sampleRate * seconds, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let b0 = 0,
        b1 = 0,
        b2 = 0;
      for (let i = 0; i < d.length; i++) {
        const w = Math.random() * 2 - 1;
        if (!pink) d[i] = w;
        else {
          b0 = 0.99765 * b0 + w * 0.099046;
          b1 = 0.963 * b1 + w * 0.2965164;
          b2 = 0.57 * b2 + w * 1.0526913;
          d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
        }
      }
    }
    return buf;
  }

  private impulse(seconds: number) {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(2, ctx.sampleRate * seconds, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    }
    return buf;
  }

  dispose() {
    clearInterval(this.timer);
    clearInterval(this.ticker);
    this.scene?.close(0.1);
    this.districts?.closeAll(0.1);
    void this.ctx?.close();
  }
}
