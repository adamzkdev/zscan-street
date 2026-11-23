/**
 * ZK LEGENDS' sound: recorded audio, all CC0 (public/audio/legends/SOURCES.md).
 * - Music (public/audio/legends/music): a tavern menu theme, two duel loops (one per game, by turns),
 *   a tense loop for when a hero is low, a victory and a defeat sting. `music(track)` crossfades;
 *   loops are scheduled instance after instance with a short overlap, so a codec's padding never
 *   leaves a gap. `startDrone()` / `stopDrone()` (the names the table already calls) are the duel music.
 * - Effects (public/audio/legends/sfx): Kenney's CC0 packs (cards, chips, impacts, glass, interface,
 *   sci-fi) and musical stingers for the rare / epic / legendary reveals. Each call picks one of the
 *   takes at random with a little pitch and level drift, so repeats don't sound mechanical.
 * Everything loads lazily (fetch + decode, kept); until a file is in, the old synthesised version
 * plays instead. It all goes through the party's audio bus (`sound()`), so it follows the city's
 * sound switch, with a small room reverb of its own for the effects.
 */
import { sound } from "../../party/kit";

const BASE = `${import.meta.env?.BASE_URL ?? "/"}audio/legends/`;

/** The effects and how many takes each has (sfx/<key>-<i>.m4a). */
const SFX = {
  draw: 5,
  pick: 3,
  place: 4,
  land: 3,
  landbig: 2,
  boom: 1,
  slash: 2,
  hit: 4,
  hitbig: 4,
  herohit: 3,
  shatter: 3,
  crunch: 2,
  halo: 4,
  freeze: 3,
  field: 3,
  phaser: 1,
  bolt: 4,
  heal: 2,
  buff: 3,
  secret: 2,
  reveal: 1,
  bell: 2,
  switch: 1,
  error: 2,
  coin: 4,
  pack: 2,
  packout: 1,
  fan: 2,
  rare: 1,
  epic: 1,
  legendary: 1,
  hover: 2,
  click: 2,
} as const;
type Sfx = keyof typeof SFX;

export type Track = "menu" | "duel" | "tension";
/** Loops: overlap between two instances (s). The tense track has fades of its own, so a longer one. */
const LOOPS: Record<string, { file: string; overlap: number; gain: number }> = {
  menu: { file: "menu", overlap: 0.03, gain: 0.9 },
  "duel-a": { file: "duel-a", overlap: 0.03, gain: 0.85 },
  "duel-b": { file: "duel-b", overlap: 0.03, gain: 0.85 },
  tension: { file: "tension", overlap: 1.2, gain: 0.85 },
};

interface Clip {
  buf: AudioBuffer;
  /** Where the sound really starts and ends (codec padding and leading silence skipped). */
  start: number;
  end: number;
}

interface Playing {
  key: string;
  gain: GainNode;
  srcs: Set<AudioBufferSourceNode>;
  timer: ReturnType<typeof setTimeout> | null;
  next: number;
  stopped: boolean;
}

type Opt = { gain?: number; rate?: number; at?: number; dry?: boolean; pan?: number };

export class LegendsSound {
  private ac: AudioContext | null = null;
  private out: GainNode | null = null;
  private fxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private send: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private clips = new Map<string, Promise<Clip | null>>();
  private ready = new Map<string, Clip>();
  private playing: Playing | null = null;
  private want: Track | null = null;
  private duelTake = Math.random() < 0.5 ? "duel-a" : "duel-b";
  private warmed = false;
  private _muted = false;
  /** The loop being fetched to start (one at a time). */
  private starting: string | null = null;

  get muted() {
    return this._muted;
  }
  set muted(v: boolean) {
    this._muted = v;
    if (v) {
      this.fadeOut(0.4);
      this.stopAmb();
    } else {
      if (this.want) this.startTrack(this.want);
      if (this.ambWant) this.ambience(this.ambWant);
    }
  }

  // ---- the board's ambience (a loop from public/audio, under everything) ------------------------------

  private amb: { src: AudioBufferSourceNode; g: GainNode; key: string } | null = null;
  private ambWant: string | null = null;
  /** The arena's ambient loop (public/audio/<name>.m4a), quietly under the music; null: none. */
  ambience(name: string | null) {
    this.ambWant = name;
    if (this.amb && this.amb.key !== name) this.stopAmb();
    const ac = this.ctx();
    if (!ac || !name || this.amb) return;
    void this.clip(`../${name}`).then((c) => {
      if (!c || this.ambWant !== name || this.amb || !this.out || this._muted) return;
      const src = ac.createBufferSource();
      src.buffer = c.buf;
      src.loop = true;
      src.loopStart = c.start;
      src.loopEnd = c.end;
      const g = ac.createGain();
      g.gain.value = 0;
      g.gain.setTargetAtTime(0.3, ac.currentTime, 1.2);
      src.connect(g).connect(this.out);
      src.start();
      this.amb = { src, g, key: name };
    });
  }
  private stopAmb() {
    const a = this.amb;
    this.amb = null;
    if (!a || !this.ac) return;
    a.g.gain.setTargetAtTime(0, this.ac.currentTime, 0.5);
    setTimeout(() => {
      try {
        a.src.stop();
      } catch {
        /* already stopped */
      }
    }, 2500);
  }

  // ---- the chain ------------------------------------------------------------------------------------

  private ctx(): AudioContext | null {
    if (this._muted) return null;
    const s = sound();
    if (!s) return null;
    if (this.ac !== s.ac || !this.out) {
      const ac = (this.ac = s.ac);
      this.clips.clear();
      this.ready.clear();
      this.playing = null;
      this.warmed = false;
      this.out = ac.createGain();
      this.out.gain.value = 1;
      this.out.connect(s.bus);
      this.fxBus = ac.createGain();
      this.fxBus.gain.value = 0.85;
      this.fxBus.connect(this.out);
      this.musicBus = ac.createGain();
      this.musicBus.gain.value = 0.42;
      this.musicBus.connect(this.out);
      // a small room: a short decaying noise impulse
      const rev = ac.createConvolver();
      const n = Math.round(ac.sampleRate * 0.9);
      const ir = ac.createBuffer(2, n, ac.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = ir.getChannelData(c);
        for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2);
      }
      rev.buffer = ir;
      this.send = ac.createGain();
      this.send.gain.value = 0.14;
      this.send.connect(rev).connect(this.fxBus);
      const nn = ac.sampleRate;
      this.noiseBuf = ac.createBuffer(1, nn, nn);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < nn; i++) d[i] = Math.random() * 2 - 1;
    }
    if (!this.warmed) {
      this.warmed = true;
      void this.warm();
    }
    // the music that was asked for while the sound was off (or before the context came)
    if (this.want && !this.playing && !this.starting) {
      const w = this.want;
      setTimeout(() => this.want === w && !this.playing && !this.starting && this.startTrack(w), 0);
    }
    return this.ac;
  }

  /** Fetch every effect in the background, a few at a time (≈ 0.8 MB). */
  private async warm() {
    const keys: string[] = [];
    for (const [k, n] of Object.entries(SFX)) for (let i = 0; i < n; i++) keys.push(`sfx/${k}-${i}`);
    keys.push("music/victory", "music/defeat");
    let i = 0;
    const worker = async () => {
      while (i < keys.length) await this.clip(keys[i++]);
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
  }

  private clip(key: string): Promise<Clip | null> {
    const ac = this.ac;
    if (!ac) return Promise.resolve(null);
    let p = this.clips.get(key);
    if (!p) {
      p = fetch(`${BASE}${key}.m4a`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status}`))))
        .then((a) => ac.decodeAudioData(a))
        .then((buf) => {
          // the real sound: past the codec's priming silence, before its padding
          const d = buf.getChannelData(0);
          let s = 0,
            e = d.length - 1;
          while (s < d.length && Math.abs(d[s]) < 2e-4) s++;
          while (e > s && Math.abs(d[e]) < 2e-4) e--;
          const c = { buf, start: s / buf.sampleRate, end: (e + 1) / buf.sampleRate };
          this.ready.set(key, c);
          return c;
        })
        .catch((err) => {
          console.warn("legends sound: could not load", key, err);
          return null;
        });
      this.clips.set(key, p);
    }
    return p;
  }

  /** One take of an effect, played now; false when it isn't loaded yet (the caller plays its synth). */
  private fx(k: Sfx, o: Opt = {}): boolean {
    const ac = this.ctx();
    if (!ac || !this.fxBus) return true; // (sound off: nothing at all, no synth either)
    const n = SFX[k];
    const key = `sfx/${k}-${Math.floor(Math.random() * n)}`;
    const c = this.ready.get(key);
    if (!c) {
      void this.clip(key);
      return false;
    }
    const t = ac.currentTime + (o.at ?? 0);
    const src = ac.createBufferSource();
    src.buffer = c.buf;
    src.playbackRate.value = (o.rate ?? 1) * (1 + (Math.random() - 0.5) * 0.07);
    const g = ac.createGain();
    g.gain.value = (o.gain ?? 0.8) * (0.9 + Math.random() * 0.14);
    let node: AudioNode = src.connect(g);
    if (o.pan) {
      const p = ac.createStereoPanner();
      p.pan.value = o.pan;
      node = node.connect(p);
    }
    node.connect(this.fxBus);
    if (!o.dry && this.send) node.connect(this.send);
    src.start(t, c.start, Math.max(0.01, c.end - c.start));
    return true;
  }

  // ---- music ----------------------------------------------------------------------------------------

  /** Change the music (null: fade it out). The same track again does nothing. */
  music(track: Track | null) {
    if (track === "duel" && this.want !== "duel" && this.want !== "tension") this.duelTake = this.duelTake === "duel-a" ? "duel-b" : "duel-a";
    this.want = track;
    if (!track) return this.fadeOut(1.2);
    this.startTrack(track);
  }

  private loopKey(t: Track) {
    return t === "duel" ? this.duelTake : t;
  }

  private startTrack(t: Track) {
    const key = this.loopKey(t);
    if (this.starting === key) return;
    if (this.playing && this.playing.key === key && !this.playing.stopped) return;
    const ac = this.ctx();
    if (!ac || !this.musicBus) return;
    const spec = LOOPS[key];
    this.starting = key;
    void this.clip(`music/${spec.file}`).then((c) => {
      if (this.starting === key) this.starting = null;
      if (!c || this.ac !== ac || this.loopKey(this.want ?? "menu") !== key || this._muted || !this.want) return;
      if (this.playing && this.playing.key === key && !this.playing.stopped) return;
      this.fadeOut(1.4);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(spec.gain, ac.currentTime + 1.4);
      g.connect(this.musicBus!);
      const p: Playing = { key, gain: g, srcs: new Set(), timer: null, next: ac.currentTime + 0.05, stopped: false };
      this.playing = p;
      this.schedule(p, c, spec.overlap);
    });
  }

  /** Lay the next instance of the loop when it's near, again and again. */
  private schedule(p: Playing, c: Clip, overlap: number) {
    const ac = this.ac;
    if (!ac || p.stopped) return;
    const len = c.end - c.start;
    while (p.next < ac.currentTime + 1.5) {
      const t = Math.max(p.next, ac.currentTime + 0.02);
      const src = ac.createBufferSource();
      src.buffer = c.buf;
      const env = ac.createGain();
      // a short (or, for the tense track, longer) crossfade between instances
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(1, t + overlap);
      env.gain.setValueAtTime(1, t + len - overlap);
      env.gain.linearRampToValueAtTime(0, t + len);
      src.connect(env).connect(p.gain);
      src.start(t, c.start, len);
      p.srcs.add(src);
      src.onended = () => p.srcs.delete(src);
      p.next = t + len - overlap;
    }
    p.timer = setTimeout(() => this.schedule(p, c, overlap), 500);
  }

  private fadeOut(s: number) {
    const p = this.playing;
    const ac = this.ac;
    if (!p || !ac) return;
    this.playing = null;
    p.stopped = true;
    if (p.timer) clearTimeout(p.timer);
    const now = ac.currentTime;
    p.gain.gain.cancelScheduledValues(now);
    p.gain.gain.setValueAtTime(Math.max(0.0001, p.gain.gain.value), now);
    p.gain.gain.exponentialRampToValueAtTime(0.0001, now + s);
    for (const src of p.srcs) {
      try {
        src.stop(now + s + 0.05);
      } catch {
        /* (already stopped) */
      }
    }
    setTimeout(() => p.gain.disconnect(), (s + 0.3) * 1000);
  }

  /** A one-shot over silence: the music goes, this plays once (victory, defeat). */
  private sting(file: string, gain: number) {
    const ac = this.ctx();
    this.want = null;
    this.fadeOut(0.5);
    if (!ac || !this.musicBus) return false;
    const c = this.ready.get(`music/${file}`);
    if (!c) {
      void this.clip(`music/${file}`).then((cc) => cc && this.ac === ac && !this.want && this.playSting(cc, gain));
      return true;
    }
    this.playSting(c, gain);
    return true;
  }
  private playSting(c: Clip, gain: number) {
    const ac = this.ac!;
    const src = ac.createBufferSource();
    src.buffer = c.buf;
    const g = ac.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.musicBus!);
    src.start(ac.currentTime + 0.25, c.start, c.end - c.start);
  }

  /** The duel music (the table's old names for it). */
  startDrone() {
    this.music("duel");
  }
  stopDrone() {
    this.music(null);
  }

  // ---- the effects ----------------------------------------------------------------------------------

  draw() {
    if (!this.fx("draw", { gain: 0.55 })) this.synth.noise(0.18, { f: 2400, to: 5200, q: 0.8, gain: 0.12 });
  }
  hover() {
    if (!this.fx("hover", { gain: 0.18, dry: true })) this.synth.noise(0.06, { f: 3800, q: 2, gain: 0.04 });
  }
  pick() {
    if (!this.fx("pick", { gain: 0.6 })) {
      this.synth.noise(0.1, { f: 1800, to: 3000, gain: 0.1 });
      this.synth.tone(660, 0.08, { type: "triangle", gain: 0.05 });
    }
  }
  play() {
    if (!this.fx("place", { gain: 0.85 })) {
      this.synth.noise(0.22, { f: 900, to: 300, gain: 0.22 });
      this.synth.tone(140, 0.25, { type: "sine", gain: 0.35, to: 60 });
    }
  }
  land(big = false) {
    if (big) {
      const ok = this.fx("landbig", { gain: 0.85, rate: 0.85 });
      this.fx("boom", { gain: 0.75 });
      this.fx("bell", { gain: 0.25, rate: 0.75, at: 0.05 });
      if (!ok) this.synth.land(true);
    } else if (!this.fx("land", { gain: 0.8 })) this.synth.land(false);
  }
  attack() {
    // a real swing is mostly air: a filtered noise sweep, with a blade's swish on top
    this.synth.noise(0.28, { f: 500, to: 2400, q: 0.7, gain: 0.14 });
    this.fx("slash", { gain: 0.35, rate: 1.15 });
  }
  hit(n: number) {
    const big = n >= 5;
    const ok = this.fx(big ? "hitbig" : "hit", { gain: Math.min(1, 0.6 + n * 0.06), rate: big ? 0.9 : 1 });
    if (!ok) this.synth.hit(n);
  }
  heroHit() {
    const ok = this.fx("herohit", { gain: 0.75 });
    this.fx("hitbig", { gain: 0.55, rate: 0.85 });
    if (!ok) this.synth.heroHit();
  }
  die() {
    const ok = this.fx("shatter", { gain: 0.75 });
    this.fx("crunch", { gain: 0.4, rate: 1.1 });
    if (!ok) this.synth.die();
  }
  halo() {
    if (!this.fx("halo", { gain: 0.7, rate: 1.1 })) this.synth.halo();
  }
  freeze() {
    const ok = this.fx("freeze", { gain: 0.7 });
    this.fx("field", { gain: 0.35, rate: 1.4 });
    if (!ok) this.synth.freeze();
  }
  spell() {
    const ok = this.fx("field", { gain: 0.5 });
    this.fx("phaser", { gain: 0.3, at: 0.05 });
    if (!ok) this.synth.spell();
  }
  bolt() {
    if (!this.fx("bolt", { gain: 0.55 })) this.synth.bolt();
  }
  heal() {
    if (!this.fx("heal", { gain: 0.55 })) this.synth.heal();
  }
  buff() {
    if (!this.fx("buff", { gain: 0.6 })) this.synth.buff();
  }
  secret() {
    if (!this.fx("secret", { gain: 0.6, rate: 0.9 })) this.synth.secret();
  }
  reveal() {
    const ok = this.fx("reveal", { gain: 0.8, dry: true });
    this.fx("field", { gain: 0.3 });
    if (!ok) this.synth.reveal();
  }
  turn() {
    if (!this.fx("bell", { gain: 0.6 })) this.synth.turn();
  }
  end() {
    if (!this.fx("switch", { gain: 0.6 })) this.synth.end();
  }
  error() {
    if (!this.fx("error", { gain: 0.5, dry: true })) this.synth.error();
  }
  coin() {
    if (!this.fx("coin", { gain: 0.65 })) this.synth.coin();
  }
  win() {
    this.sting("victory", 1);
    this.fx("legendary", { gain: 0.5, dry: true });
  }
  lose() {
    this.sting("defeat", 1);
  }
  /** A card pack torn open. */
  packOpen() {
    const ok = this.fx("pack", { gain: 0.85 });
    this.fx("packout", { gain: 0.6, at: 0.35 });
    if (!ok) this.synth.noise(0.5, { f: 1500, to: 400, gain: 0.2 });
  }
  /** A card turned face up (packs, discover): its rarity sets the stinger. */
  flip(rarity: string) {
    const ok = this.fx("fan", { gain: 0.6 });
    if (!ok) this.draw();
    if (rarity === "rare") this.fx("rare", { gain: 0.55, dry: true, at: 0.05 });
    else if (rarity === "epic") {
      this.fx("epic", { gain: 0.6, dry: true, at: 0.05 });
      this.fx("field", { gain: 0.3, rate: 1.2 });
    } else if (rarity === "legendary") {
      this.fx("legendary", { gain: 0.75, dry: true, at: 0.05 });
      this.fx("bell", { gain: 0.45, rate: 0.8 });
      this.fx("boom", { gain: 0.5 });
    }
  }
  /** Menus: a pointer over a button, a click. */
  ui(kind: "hover" | "click") {
    if (kind === "hover") this.hover();
    else if (!this.fx("click", { gain: 0.45, dry: true })) this.synth.tone(900, 0.04, { type: "square", gain: 0.03 });
  }

  // ---- the synthesised stand-ins (while a file loads) ---------------------------------------------------

  private synth = {
    tone: (freq: number, dur: number, o: { type?: OscillatorType; gain?: number; to?: number; at?: number } = {}) => {
      const ac = this.ctx();
      if (!ac || !this.fxBus) return;
      const t = ac.currentTime + (o.at ?? 0);
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = o.type ?? "sine";
      osc.frequency.setValueAtTime(freq, t);
      if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(o.gain ?? 0.2, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g).connect(this.fxBus);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    },
    noise: (dur: number, o: { f?: number; to?: number; q?: number; gain?: number; at?: number; type?: BiquadFilterType } = {}) => {
      const ac = this.ctx();
      if (!ac || !this.fxBus || !this.noiseBuf) return;
      const t = ac.currentTime + (o.at ?? 0);
      const src = ac.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const f = ac.createBiquadFilter();
      f.type = o.type ?? "bandpass";
      f.frequency.setValueAtTime(o.f ?? 1200, t);
      if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
      f.Q.value = o.q ?? 1;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(o.gain ?? 0.25, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f).connect(g).connect(this.fxBus);
      src.start(t, Math.random());
      src.stop(t + dur + 0.05);
    },
    land: (big: boolean) => {
      this.synth.tone(big ? 70 : 110, big ? 0.5 : 0.28, { gain: big ? 0.55 : 0.35, to: 40 });
      this.synth.noise(big ? 0.5 : 0.25, { f: 500, to: 120, gain: big ? 0.35 : 0.2, type: "lowpass" });
    },
    hit: (n: number) => {
      const k = Math.min(1, n / 8);
      this.synth.tone(180 - k * 80, 0.18 + k * 0.2, { type: "square", gain: 0.12 + k * 0.1, to: 50 });
      this.synth.noise(0.15 + k * 0.25, { f: 1400 - k * 700, to: 200, gain: 0.25 + k * 0.15 });
    },
    heroHit: () => {
      this.synth.tone(90, 0.45, { type: "sawtooth", gain: 0.16, to: 40 });
      this.synth.noise(0.4, { f: 800, to: 150, gain: 0.3, type: "lowpass" });
    },
    die: () => this.synth.noise(0.6, { f: 2000, to: 120, q: 0.6, gain: 0.28 }),
    halo: () => [1568, 2093, 2637].forEach((f, i) => this.synth.tone(f, 0.5, { gain: 0.08, at: i * 0.03 })),
    freeze: () => this.synth.noise(0.5, { f: 7000, q: 3, gain: 0.08 }),
    spell: () => [523, 784, 1047].forEach((f, i) => this.synth.tone(f, 0.35, { type: "triangle", gain: 0.07, at: i * 0.05 })),
    bolt: () => this.synth.noise(0.3, { f: 2500, to: 600, gain: 0.12 }),
    heal: () => [523, 659, 784, 1047].forEach((f, i) => this.synth.tone(f, 0.4, { gain: 0.07, at: i * 0.06 })),
    buff: () => [392, 523, 659].forEach((f, i) => this.synth.tone(f, 0.25, { type: "triangle", gain: 0.07, at: i * 0.04 })),
    secret: () => this.synth.tone(220, 0.6, { type: "triangle", gain: 0.1 }),
    reveal: () => [880, 1109, 1319, 1760].forEach((f, i) => this.synth.tone(f, 0.3, { type: "square", gain: 0.05, at: i * 0.05 })),
    turn: () => {
      this.synth.tone(392, 1.2, { gain: 0.16 });
      this.synth.tone(587, 1.2, { gain: 0.1, at: 0.02 });
    },
    end: () => this.synth.tone(330, 0.15, { type: "triangle", gain: 0.1 }),
    error: () => {
      this.synth.tone(150, 0.18, { type: "square", gain: 0.08 });
      this.synth.tone(120, 0.2, { type: "square", gain: 0.08, at: 0.1 });
    },
    coin: () => {
      this.synth.tone(1319, 0.12, { type: "square", gain: 0.06 });
      this.synth.tone(1760, 0.3, { type: "square", gain: 0.06, at: 0.08 });
    },
  };
}
