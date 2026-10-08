import { type Bufs, makeBufs, Scene } from "./audio/lib";
import { LEVEL, PRESETS, presetFor } from "./audio/scenes";
import { Districts, type StreetEar } from "./audio/street";
import { loopInto, type Playing, shotInto } from "./audio/samples";
import { type Ear, LiveMix } from "./audio/livemix";

/** Where the ear is: a place's key and floor (its name picks the floor's soundscape), or the street. */
export interface SceneOpts {
  /** The floor's name ("Casino · tables, slots"…). */
  name?: string;
  /** On the street: where the ear is (x, z), how close the view is (0 wide map … 1 on foot). */
  x?: number;
  z?: number;
  near?: number;
  night?: boolean;
  /** Inside: the walking camera, for the live music's positional sound (src/audio/live.ts). */
  ear?: Ear;
}

/**
 * The city's soundscape, made of real field recordings (public/audio, fetched the first time they
 * are needed) and a few synthesised one-shots (horns, chimes, the crossing signal, thunder).
 * On the street: a city street recorded in Tokyo (by day) or a city at night, louder where the
 * people and the traffic are, rain on the pavement, a soft lo-fi pad, the little sounds of the
 * street (the konbini door chime, the bus pulling in), and a layer for the district you are in
 * (src/audio/street.ts). Inside a place: that place's own soundscape, by floor
 * (src/audio/scenes.ts), cross-faded in as you walk in or change floor.
 * Browsers only allow sound after a click, so it starts from the HUD's sound button; nothing is
 * built or played before.
 */
/** The lo-fi pad's level on the street. */
const MUSIC = 0.2;

export class Soundscape {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private rainGain!: GainNode;
  private rainLP!: BiquadFilterNode;
  private musicGain!: GainNode;
  private sfxGain!: GainNode;
  private streetBus!: GainNode;
  private rainOn = true;
  /** The city's bed: day and night recordings, cross-faded with the theme. */
  private cityDay: Playing | null = null;
  private cityNight: Playing | null = null;
  private cityLevel = 0.7;
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
  /** The place's live musicians, mixed into its scene (src/audio/livemix.ts). */
  private liveMix: LiveMix | null = null;
  private liveEar: Ear | null = null;
  private districts: Districts | null = null;
  private ear: StreetEar = { x: 0, z: 0, near: 1, night: true };
  private lastEar = 0;
  /** How much of the street's rain reaches you (1 outside). */
  private rainIn = 1;
  /** Places' soundscapes go through `bed`, so a film's soundtrack can duck them (see film()). */
  private bed!: GainNode;
  private filmGain!: GainNode;
  private filmEl: HTMLMediaElement | null = null;
  private filmSrc = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();
  on = false;

  constructor() {
    if (typeof window === "undefined") return;
    // the places tell us what happens in them
    window.addEventListener("zstreet:colosseum", (e) => {
      const d = (e as CustomEvent<{ type: string; winner?: number }>).detail;
      if (d?.type) this.event(d.type, d);
    });
    // ZK CINEMA's film playing in the room you are in (or none)
    window.addEventListener("zstreet:film", (e) => this.film((e as CustomEvent<{ el: HTMLMediaElement | null }>).detail?.el ?? null));
    // the cinema threw a video away: let go of its source node
    window.addEventListener("zstreet:film-gone", (e) => {
      const el = (e as CustomEvent<{ el: HTMLMediaElement }>).detail?.el;
      if (!el) return;
      this.filmSrc.get(el)?.disconnect();
      this.filmSrc.delete(el);
      if (this.filmEl === el) this.film(null);
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
    this.filmSync();
  }

  stop() {
    if (!this.ctx) return;
    this.on = false;
    this.fade(this.master, 0, 0.6);
    this.filmSync();
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
    if (opts.ear) this.liveEar = opts.ear;
    if (key === "street") {
      this.ear = { x: opts.x ?? this.ear.x, z: opts.z ?? this.ear.z, near: opts.near ?? this.ear.near, night: opts.night ?? this.ear.night };
    }
    if (!this.ctx || !this.on) return;
    if (moved || this.preset !== this.presetId()) this.apply(false, moved);
    if (key !== "street") this.liveMix?.update(this.liveEar);
    if (key === "street" && this.districts) {
      const now = this.ctx.currentTime;
      const dt = Math.min(1, now - this.lastEar);
      this.lastEar = now;
      this.districts.update(this.ear, dt);
      this.cityMix();
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
      layers: this.preset === "street" ? ["rain", this.ear.night ? "city-night" : "city-day", "lofi-pad"] : (this.scene?.layers ?? []),
      events: Object.keys(this.scene?.on ?? {}),
      districts: this.preset === "street" ? { ...(this.districts?.weights ?? {}) } : {},
      districtLayers: this.preset === "street" ? (this.districts?.layers() ?? {}) : {},
      rain: this.rainIn,
      live: this.liveMix?.debug ?? [],
      rms: Math.round(rms * 10000) / 10000,
    };
  }

  private presetId() {
    return this.place === "street" ? "street" : presetFor(this.place, this.floor, this.placeName);
  }

  /** Cross-fade to the soundscape of where the ear is now. */
  private apply(instant: boolean, moved = false) {
    if (!this.ctx) return;
    const id = this.presetId();
    // same soundscape on another floor: only the live music changes (its players are per floor)
    if (id === this.preset && !instant && moved && this.scene) {
      this.liveMix?.close();
      this.liveMix = new LiveMix(this.scene, this.place, this.floor);
      return;
    }
    if (id === this.preset && !instant) return;
    const changed = id !== this.preset;
    this.preset = id;
    const xf = instant ? 0.6 : 1.4;
    if (changed || id === "street") {
      this.scene?.close(xf);
      this.scene = null;
      this.liveMix?.close();
      this.liveMix = null;
    }
    const p = id === "street" ? null : PRESETS[id];
    if (id === "street") {
      this.fade(this.streetBus, 1, xf);
      this.fade(this.musicGain, MUSIC, xf);
      this.rainIn = 1;
    } else {
      this.districts?.closeAll(xf);
      this.fade(this.streetBus, 0, xf);
      this.fade(this.musicGain, 0, xf);
      this.rainIn = p?.rain ?? 0.1;
      if (p && (changed || !this.scene)) {
        const s = new Scene(this.ctx, this.bufs, this.bed, id, p.room);
        try {
          p.build(s, { night: this.ear.night, floor: this.floor, name: this.placeName });
        } catch (e) {
          console.warn("sound: scene", id, e);
        }
        s.fade(LEVEL[id] ?? 1, xf);
        this.scene = s;
      }
      // the musicians of this floor (and the ones heard from the floor next door)
      if (this.scene && !this.liveMix) this.liveMix = new LiveMix(this.scene, this.place, this.floor);
    }
    // the rain through walls: quieter and duller indoors
    const t = this.ctx.currentTime;
    this.rainLP.frequency.setTargetAtTime(this.rainIn >= 1 ? 16000 : 400 + 3000 * this.rainIn, t, 0.4);
    this.fade(this.rainGain, this.rainOn ? 0.55 * this.rainIn : 0, xf);
  }

  /**
   * A film's soundtrack (a <video> playing in the cinema room you are in; null: none). Its sound
   * reaches you only with the sound on, through the master (so the sound button and the fades
   * apply), and the place's soundscape is ducked under it. Otherwise the video stays muted.
   */
  film(el: HTMLMediaElement | null) {
    const old = this.filmEl;
    this.filmEl = el;
    if (old && old !== el) old.muted = true;
    this.filmSync();
  }

  private filmSync() {
    const el = this.filmEl;
    if (this.ctx) this.fade(this.bed, el && this.on ? 0.22 : 1, 0.8);
    if (!el) return;
    if (!this.ctx || !this.on) {
      el.muted = true;
      return;
    }
    try {
      let src = this.filmSrc.get(el);
      if (!src) this.filmSrc.set(el, (src = this.ctx.createMediaElementSource(el)));
      src.connect(this.filmGain);
    } catch {
      return;
    }
    el.muted = false;
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

  /** A lift arriving: the two-tone ding (indoors too). */
  liftDing() {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime;
    [1174.7, 880].forEach((f, i) => this.bell(f, t + i * 0.32, 0.9, 0.06));
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

  /** The power going (a falling mains hum and a breaker's thunk) or coming back (a rising hum). */
  power(down: boolean) {
    if (!this.on || !this.ctx || this.indoors) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.05;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(down ? 120 : 30, t);
    o.frequency.exponentialRampToValueAtTime(down ? 28 : 100, t + (down ? 1.6 : 1.1));
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 700;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (down ? 1.8 : 1.3));
    o.connect(lp).connect(g).connect(this.sfxGain);
    o.start(t);
    o.stop(t + 2);
    // the breaker
    const n = ctx.createBufferSource();
    n.buffer = this.noise(0.2, false);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = down ? 220 : 1600;
    const gn = ctx.createGain();
    const at = down ? t : t + 1.05;
    gn.gain.setValueAtTime(0.25, at);
    gn.gain.exponentialRampToValueAtTime(0.0001, at + 0.15);
    n.connect(bp).connect(gn).connect(this.sfxGain);
    n.start(at);
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
    // the city cheers a rise from afar (a real crowd, muffled)
    if (up) shotInto(this.ctx, this.sfxGain, "goal", this.ctx.currentTime + 0.1, 0.12, { lp: 900 });
  }

  private build() {
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.bufs = makeBufs(ctx);
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.bed = ctx.createGain();
    this.bed.connect(this.master);
    this.filmGain = ctx.createGain();
    this.filmGain.gain.value = 0.9;
    this.filmGain.connect(this.master);
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
    this.musicGain.gain.value = MUSIC;
    this.sfxGain = ctx.createGain();
    this.sfxGain.gain.value = 0.8;
    for (const g of [this.musicGain, this.sfxGain]) g.connect(this.master);
    this.musicGain.connect(verb);
    this.sfxGain.connect(verb);
    this.rain();
    this.music();
    this.street();
  }

  /** The street around the camera: the city, recorded (a Tokyo street by day, a city at night). */
  private street() {
    const ctx = this.ctx!;
    this.cityDay = loopInto(ctx, this.streetBus, "city-day", 0);
    this.cityNight = loopInto(ctx, this.streetBus, "city-night", 0);
    this.cityMix();
  }

  private cityMix() {
    if (!this.ctx || !this.cityDay || !this.cityNight) return;
    const t = this.ctx.currentTime;
    // the wide map hears a hint of the city; on foot, all of it
    const lvl = this.cityLevel * (0.3 + 0.7 * this.ear.near);
    this.cityDay.gain.gain.setTargetAtTime(this.ear.night ? 0 : lvl, t, 0.8);
    this.cityNight.gain.gain.setTargetAtTime(this.ear.night ? lvl * 1.1 : 0, t, 0.8);
  }

  /**
   * What the camera hears, 0..1 each: people nearby, traffic nearby, and the pedestrian crossing's
   * signal (null when nobody is crossing or it is too far), panned left or right (-1..1).
   */
  ambience(crowd: number, traffic: number, crossing: { level: number; pan: number } | null) {
    if (!this.ctx || !this.on || this.indoors) return;
    const t = this.ctx.currentTime;
    // the city's bed swells where the people and the cars are
    this.cityLevel = 0.7 + 0.3 * Math.max(crowd, traffic);
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

  /** Rain on the pavement, recorded. */
  private rain() {
    loopInto(this.ctx!, this.rainGain, "rain", 1, { fadeIn: 2 });
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
