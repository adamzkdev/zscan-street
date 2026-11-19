/**
 * LAST SNARK's sound, all synthesised (no files): the card noises (riffle, deal, slap, draw), one
 * voice per special card, the shout and the stingers, and the room: a low room tone under a quiet
 * lounge trio (Rhodes, upright bass, brushes) on a ii–V–I loop. It plays through the party's audio
 * bus (`sound()` from party/kit, which follows the city's sound switch), with a small room reverb of
 * its own: a thin adapter to move onto the shared engine in src/audio/ once that lands.
 */
import { sound } from "../../party/kit";
import { master } from "../../audio/master";

type Opt = { pan?: number; wet?: number; attack?: number };

export class GlyphSound {
  private ac: AudioContext | null = null;
  private out: GainNode | null = null;
  private music: GainNode | null = null;
  private rev: ConvolverNode | null = null;
  private send: GainNode | null = null;
  private white: AudioBuffer | null = null;
  private brown: AudioBuffer | null = null;
  private room: AudioBufferSourceNode | null = null;
  private seq = 0;
  private beat = 0;
  private nextT = 0;
  private wantRoom = false;
  private unwatch: (() => void) | null = null;
  private rnd = Math.random;

  /** The context and our chain, built on first use (null: the sound is off or not allowed yet). */
  private ctx(): AudioContext | null {
    const s = sound();
    if (!s) return null;
    if (this.ac !== s.ac || !this.out) {
      const ac = (this.ac = s.ac);
      this.out = ac.createGain();
      this.out.gain.value = 1.15;
      this.out.connect(s.bus);
      this.music = ac.createGain();
      this.music.gain.value = 0;
      this.music.connect(this.out);
      // a small felt-and-wood room: 1.1 s, dark
      this.rev = ac.createConvolver();
      const len = Math.floor(ac.sampleRate * 1.1);
      const ir = ac.createBuffer(2, len, ac.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = ir.getChannelData(c);
        let lp = 0;
        for (let i = 0; i < len; i++) {
          lp += 0.35 * (Math.random() * 2 - 1 - lp);
          d[i] = lp * Math.pow(1 - i / len, 3.2) * (i < ac.sampleRate * 0.012 ? i / (ac.sampleRate * 0.012) : 1);
        }
      }
      this.rev.buffer = ir;
      this.send = ac.createGain();
      this.send.gain.value = 0.9;
      this.send.connect(this.rev).connect(this.out);
      const n = ac.sampleRate * 2;
      this.white = ac.createBuffer(1, n, ac.sampleRate);
      const w = this.white.getChannelData(0);
      for (let i = 0; i < n; i++) w[i] = Math.random() * 2 - 1;
      this.brown = ac.createBuffer(1, n * 2, ac.sampleRate);
      const b = this.brown.getChannelData(0);
      let last = 0;
      for (let i = 0; i < b.length; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        b[i] = last * 3.5;
      }
      this.room = null;
    }
    return this.ac;
  }

  private dest(ac: AudioContext, g: AudioNode, o: Opt, bus?: GainNode | null) {
    let node: AudioNode = g;
    if (o.pan) {
      const p = ac.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, o.pan));
      g.connect(p);
      node = p;
    }
    node.connect(bus ?? this.out!);
    if (o.wet && this.send) {
      const s = ac.createGain();
      s.gain.value = o.wet;
      node.connect(s).connect(this.send);
    }
  }

  /** Filtered noise: a slide, a tap, a swish. */
  private burst(t: number, dur: number, type: BiquadFilterType, f0: number, f1: number, q: number, vol: number, o: Opt = {}, bus?: GainNode | null) {
    const ac = this.ac!;
    const src = ac.createBufferSource();
    src.buffer = this.white;
    const fl = ac.createBiquadFilter();
    fl.type = type;
    fl.Q.value = q;
    fl.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ac.createGain();
    const a = o.attack ?? 0.003;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dur);
    src.connect(fl).connect(g);
    this.dest(ac, g, o, bus);
    src.start(t, this.rnd() * 1.5, a + dur + 0.05);
  }
  private tone(t: number, f: number, type: OscillatorType, vol: number, dur: number, o: Opt & { to?: number; lp?: number } = {}, bus?: GainNode | null) {
    const ac = this.ac!;
    const osc = ac.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    const g = ac.createGain();
    const a = o.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dur);
    let src: AudioNode = osc;
    if (o.lp) {
      const fl = ac.createBiquadFilter();
      fl.type = "lowpass";
      fl.frequency.value = o.lp;
      osc.connect(fl);
      src = fl;
    }
    src.connect(g);
    this.dest(ac, g, o, bus);
    osc.start(t);
    osc.stop(t + a + dur + 0.05);
  }
  /** Two-operator FM: a bell (ratio ≈ 2.4–3.5) or an electric piano's tine (ratio 1). */
  private fm(t: number, f: number, ratio: number, index: number, dur: number, vol: number, o: Opt & { idxDecay?: number } = {}, bus?: GainNode | null) {
    const ac = this.ac!;
    const car = ac.createOscillator();
    const mod = ac.createOscillator();
    const mg = ac.createGain();
    car.frequency.value = f;
    mod.frequency.value = f * ratio;
    mg.gain.setValueAtTime(f * index, t);
    mg.gain.exponentialRampToValueAtTime(Math.max(1, f * index * 0.08), t + (o.idxDecay ?? dur * 0.5));
    mod.connect(mg).connect(car.frequency);
    const g = ac.createGain();
    const a = o.attack ?? 0.003;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dur);
    car.connect(g);
    this.dest(ac, g, o, bus);
    car.start(t);
    mod.start(t);
    car.stop(t + a + dur + 0.05);
    mod.stop(t + a + dur + 0.05);
  }

  private at(delay = 0): number | null {
    const ac = this.ctx();
    if (!ac || ac.state !== "running") return null;
    return ac.currentTime + 0.005 + delay;
  }

  // ---- the cards ----------------------------------------------------------------------------------

  /** A card skimming off the deck and landing on the felt. */
  deal(pan = 0) {
    const t = this.at();
    if (t === null) return;
    this.burst(t, 0.07, "bandpass", 5200, 2400, 0.8, 0.28, { pan });
    this.burst(t + 0.065, 0.035, "lowpass", 1600, 700, 0.7, 0.32, { pan, wet: 0.08 });
    this.tone(t + 0.065, 160, "sine", 0.1, 0.035, { pan });
  }
  /** A card flicked off the fingers. */
  flick(pan = 0) {
    const t = this.at();
    if (t === null) return;
    this.burst(t, 0.06, "bandpass", 2600, 6800, 0.9, 0.2, { pan, attack: 0.01 });
  }
  /** A card slapped onto the pile. */
  slap(pan = 0, hard = 1) {
    const t = this.at();
    if (t === null) return;
    this.burst(t, 0.012, "highpass", 3200, 3200, 0.6, 0.32 * hard, { pan });
    this.burst(t, 0.06, "lowpass", 2600, 600, 0.8, 0.62 * hard, { pan, wet: 0.14 });
    this.tone(t, 125, "sine", 0.32 * hard, 0.07, { pan, to: 70 });
  }
  /** Pulled off the top of the deck. */
  draw(pan = 0) {
    const t = this.at();
    if (t === null) return;
    this.burst(t, 0.13, "bandpass", 1500, 4400, 1, 0.26, { pan, attack: 0.025 });
    this.burst(t + 0.14, 0.03, "lowpass", 1400, 700, 0.7, 0.22, { pan });
  }
  /** A riffle: the two halves let go card by card, then the bridge and the squaring taps. */
  riffle(dur = 0.9) {
    const t = this.at();
    if (t === null) return;
    const n = 30;
    let x = 0;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      x += (0.62 * dur) / n / (0.6 + Math.sin(u * Math.PI) * 0.9);
      this.burst(t + x, 0.006 + this.rnd() * 0.006, "highpass", 2400 + this.rnd() * 1800, 2400, 0.7, 0.16 + this.rnd() * 0.14, { pan: i % 2 ? 0.35 : -0.35 });
    }
    const b = t + x + 0.04;
    this.burst(b, 0.28 * dur, "bandpass", 3000, 900, 0.7, 0.2, { attack: 0.03, wet: 0.1 });
    this.burst(b + 0.3 * dur, 0.03, "lowpass", 1500, 600, 0.8, 0.4, { wet: 0.1 });
    this.burst(b + 0.38 * dur, 0.03, "lowpass", 1500, 600, 0.8, 0.32, { wet: 0.1 });
  }

  // ---- the specials -------------------------------------------------------------------------------

  /** MISSED BLOCK: a wooden block knocked over. */
  skip(pan = 0) {
    const t = this.at(0.03);
    if (t === null) return;
    this.tone(t, 980, "sine", 0.26, 0.06, { pan, to: 760 });
    this.burst(t, 0.04, "bandpass", 1300, 1300, 4, 0.3, { pan });
    this.tone(t + 0.07, 92, "sine", 0.32, 0.2, { pan, to: 60, wet: 0.15 });
    this.burst(t + 0.07, 0.08, "lowpass", 600, 200, 0.8, 0.3, { pan });
  }
  /** REORG: a reversed swell, the table turning round. */
  reorg() {
    const t = this.at(0.02);
    if (t === null) return;
    this.burst(t, 0.34, "bandpass", 500, 3600, 1.4, 0.3, { attack: 0.3, wet: 0.35 });
    this.tone(t, 300, "triangle", 0.08, 0.34, { attack: 0.3, to: 900, wet: 0.3 });
    this.burst(t + 0.36, 0.03, "lowpass", 1800, 800, 0.8, 0.3);
  }
  /** +2 FEES: two fee chips clacked down. */
  fees(pan = 0) {
    const t = this.at(0.04);
    if (t === null) return;
    this.chips(t, 2, pan);
  }
  private chips(t: number, k: number, pan = 0) {
    for (let i = 0; i < k; i++) {
      const s = t + i * 0.085 + this.rnd() * 0.02;
      this.burst(s, 0.022, "bandpass", 3300, 3000, 4, 0.36, { pan });
      this.tone(s, 2700 + this.rnd() * 500, "sine", 0.08, 0.07, { pan, wet: 0.12 });
      this.tone(s, 4800 + this.rnd() * 300, "sine", 0.03, 0.04, { pan });
    }
  }
  /** DUST ATTACK: the floor drops out, a stutter of dust, a glassy ring. */
  shor() {
    const t = this.at(0.02);
    if (t === null) return;
    this.tone(t, 230, "sine", 0.5, 0.75, { to: 42, wet: 0.2 });
    this.tone(t, 115, "sawtooth", 0.12, 0.6, { to: 30, lp: 500 });
    for (let i = 0; i < 9; i++) this.burst(t + 0.05 + i * 0.034, 0.018, "bandpass", 700 + i * 260, 700 + i * 260, 6, 0.22 - i * 0.015);
    this.fm(t + 0.08, 1760, 2.76, 3, 1.1, 0.1, { wet: 0.45 });
  }
  /** FORK: one bell that splits in two. */
  fork() {
    const t = this.at(0.02);
    if (t === null) return;
    this.fm(t, 784, 3.5, 1.6, 0.35, 0.12, { wet: 0.3 });
    this.fm(t + 0.11, 659, 3.5, 1.6, 0.8, 0.11, { wet: 0.35, pan: -0.4 });
    this.fm(t + 0.11, 988, 3.5, 1.6, 0.8, 0.11, { wet: 0.35, pan: 0.4 });
  }
  /** SHIELDED HOUR: a marimba run round the table. */
  makers() {
    const t = this.at(0.02);
    if (t === null) return;
    [523, 659, 784, 1046, 784].forEach((f, i) => this.marimba(t + i * 0.075, f, 0.2, (i - 2) * 0.3));
  }
  private marimba(t: number, f: number, vol: number, pan = 0) {
    this.tone(t, f, "sine", vol, 0.32, { pan, wet: 0.2 });
    this.tone(t, f * 4, "sine", vol * 0.22, 0.05, { pan });
    this.burst(t, 0.01, "bandpass", f * 2, f * 2, 3, vol * 0.4, { pan });
  }

  // ---- the people ---------------------------------------------------------------------------------

  /** Your turn: two soft wooden knocks. */
  turn() {
    const t = this.at();
    if (t === null) return;
    this.marimba(t, 659, 0.16);
    this.marimba(t + 0.1, 988, 0.14);
  }
  /** LAST SNARK!: the desk bell and a short horn stab. */
  call(pan = 0) {
    const t = this.at();
    if (t === null) return;
    this.fm(t, 1568, 2.41, 3.2, 1.5, 0.22, { pan, wet: 0.3, idxDecay: 0.4 });
    this.fm(t, 2093, 2.41, 2, 1.1, 0.08, { pan, wet: 0.3 });
    for (const f of [294, 370, 440, 587]) this.tone(t + 0.02, f, "sawtooth", 0.06, 0.24, { pan, lp: 2200, attack: 0.02, wet: 0.2 });
  }
  /** Caught without the shout: a sour two-note horn. */
  caught(pan = 0) {
    const t = this.at();
    if (t === null) return;
    this.tone(t, 233, "sawtooth", 0.13, 0.2, { pan, lp: 1100, attack: 0.02, wet: 0.2 });
    this.tone(t + 0.22, 207, "sawtooth", 0.13, 0.42, { pan, lp: 800, attack: 0.02, to: 196, wet: 0.25 });
  }
  /** A seat takes a penalty: a dull thud and the cards' rustle. */
  hit(pan = 0) {
    const t = this.at();
    if (t === null) return;
    this.tone(t, 140, "sine", 0.3, 0.14, { pan, to: 70 });
    this.burst(t, 0.1, "lowpass", 900, 300, 0.7, 0.3, { pan });
  }
  /** A seat sheds its last card. */
  shed(pan = 0) {
    const t = this.at();
    if (t === null) return;
    this.fm(t, 1318, 2.41, 2.4, 1.2, 0.16, { pan, wet: 0.35 });
    [587, 740, 880, 1175].forEach((f, i) => this.fm(t + 0.05 + i * 0.07, f, 1, 1.2, 0.9, 0.08, { wet: 0.3 }));
  }
  /** You win: a Rhodes run up a Dmaj9, a bell, a cymbal swell. */
  win() {
    const t = this.at();
    if (t === null) return;
    [50, 54, 57, 61, 64, 69, 73].forEach((m, i) => this.rhodes(t + i * 0.07, m, 0.12, 1.6, null));
    this.fm(t + 0.5, 1760, 2.41, 3, 1.8, 0.12, { wet: 0.4 });
    this.burst(t + 0.05, 0.9, "highpass", 6000, 9000, 0.5, 0.06, { attack: 0.6, wet: 0.4 });
    this.chips(t + 0.6, 4, 0.2);
  }
  /** You lose: a soft, falling minor turn. */
  lose() {
    const t = this.at();
    if (t === null) return;
    [59, 62, 66].forEach((m) => this.rhodes(t, m, 0.08, 1.4, null));
    [55, 59, 62, 64].forEach((m) => this.rhodes(t + 0.7, m - 2, 0.07, 2, null));
  }
  /** Chips to the winner. */
  coin() {
    const t = this.at();
    if (t === null) return;
    this.chips(t, 3);
  }
  /** A light tick (the options, the picker). */
  tick() {
    const t = this.at();
    if (t === null) return;
    this.burst(t, 0.012, "bandpass", 2600, 2600, 2, 0.2);
    this.tone(t, 1400, "sine", 0.04, 0.03);
  }

  // ---- the room -----------------------------------------------------------------------------------

  private rhodes(t: number, m: number, vol: number, dur: number, bus: GainNode | null, pan = 0) {
    const f = 440 * Math.pow(2, (m - 69) / 12);
    this.fm(t, f, 1, 1.8, dur, vol, { pan, wet: 0.25, idxDecay: 0.5 }, bus);
    this.fm(t, f, 14, 0.5, 0.12, vol * 0.25, { pan }, bus);
  }

  /** The room tone and the trio (they follow the city's sound switch). */
  startRoom() {
    this.wantRoom = true;
    this.unwatch ??= master.watch((on) => (on ? this.ensureRoom() : this.silence()));
    this.ensureRoom();
  }
  private ensureRoom() {
    if (!this.wantRoom) return;
    const ac = this.ctx();
    if (!ac) return;
    if (!this.room) {
      const src = ac.createBufferSource();
      src.buffer = this.brown;
      src.loop = true;
      const fl = ac.createBiquadFilter();
      fl.type = "lowpass";
      fl.frequency.value = 340;
      const g = ac.createGain();
      g.gain.value = 0.0001;
      g.gain.exponentialRampToValueAtTime(0.09, ac.currentTime + 2);
      src.connect(fl).connect(g).connect(this.out!);
      src.start();
      this.room = src;
      this.music!.gain.cancelScheduledValues(ac.currentTime);
      this.music!.gain.setTargetAtTime(0.55, ac.currentTime, 1.2);
      this.nextT = ac.currentTime + 0.3;
      this.beat = 0;
    }
    if (!this.seq) this.seq = window.setInterval(() => this.schedule(), 120);
  }
  /** Fade the room out (the table closes, or the sound goes off). */
  silence() {
    if (this.seq) clearInterval(this.seq);
    this.seq = 0;
    const ac = this.ac;
    if (ac && this.room) {
      const r = this.room;
      this.music?.gain.setTargetAtTime(0, ac.currentTime, 0.3);
      try {
        r.stop(ac.currentTime + 1);
      } catch {
        // (already stopped)
      }
    }
    this.room = null;
  }
  stopRoom() {
    this.wantRoom = false;
    this.unwatch?.();
    this.unwatch = null;
    this.silence();
  }
  /** Duck the music under a stinger (0…1 of its level, for `sec` seconds). */
  duck(level: number, sec: number) {
    const ac = this.ac;
    if (!ac || !this.music || !this.room) return;
    const g = this.music.gain;
    g.cancelScheduledValues(ac.currentTime);
    g.setTargetAtTime(0.55 * level, ac.currentTime, 0.08);
    g.setTargetAtTime(0.55, ac.currentTime + sec, 0.8);
  }

  /** The lounge trio, a bar per chord at 74 bpm, swung: ii–V–I–vi in D. */
  private schedule() {
    const ac = this.ac;
    if (!ac || !this.room || ac.state !== "running") return;
    const spb = 60 / 74;
    // [bass root, chord voicing] per bar
    const BARS: [number, number[]][] = [
      [40, [55, 59, 62, 66]],
      [45, [55, 61, 66, 71]],
      [38, [54, 57, 61, 64]],
      [47, [57, 62, 64, 66]],
    ];
    const bus = this.music;
    while (this.nextT < ac.currentTime + 0.4) {
      const t = this.nextT;
      const b = this.beat;
      const bar = BARS[Math.floor(b / 4) % 4];
      const inBar = b % 4;
      const root = bar[0];
      // the bass: root, fifth, root, a walk up to the next bar
      const next = BARS[Math.floor(b / 4 + 1) % 4][0];
      const bm = inBar === 0 ? root : inBar === 1 ? root + 7 : inBar === 2 ? root + 12 : next + (next > root ? -1 : 1);
      const bf = 440 * Math.pow(2, (bm - 12 - 69) / 12) * 2;
      this.tone(t, bf, "triangle", 0.17, spb * 0.85, { lp: 520, attack: 0.012 }, bus);
      this.tone(t, bf * 2, "sine", 0.04, spb * 0.3, { attack: 0.008 }, bus);
      // the brushes: a swish on every beat, a slap on 2 and 4
      this.burst(t, spb * 0.5, "bandpass", 4200, 3000, 0.7, inBar % 2 ? 0.05 : 0.03, { attack: 0.05 }, bus);
      if (inBar % 2) this.burst(t + 0.01, 0.06, "bandpass", 2400, 1800, 1, 0.05, { wet: 0.2 }, bus);
      // the swung ride-ish tick on the "and"
      this.burst(t + spb * 0.66, 0.03, "highpass", 7000, 7000, 0.5, 0.025, {}, bus);
      // the Rhodes comps: on one, and on the "and" of two
      if (inBar === 0) for (const m of bar[1]) this.rhodes(t + this.rnd() * 0.02, m, 0.045, spb * 1.6, bus, (m - 60) / 30);
      if (inBar === 1 && this.rnd() < 0.7) for (const m of bar[1]) this.rhodes(t + spb * 0.66 + this.rnd() * 0.02, m, 0.032, spb * 0.9, bus, (m - 60) / 30);
      // now and then a vibraphone note from the chord, up high
      if (this.rnd() < 0.22) {
        const m = bar[1][Math.floor(this.rnd() * 4)] + 12;
        const f = 440 * Math.pow(2, (m - 69) / 12);
        this.fm(t + (this.rnd() < 0.5 ? 0 : spb * 0.66), f, 4, 0.5, spb * 2.2, 0.03, { wet: 0.5, pan: this.rnd() - 0.5 }, bus);
      }
      this.beat++;
      this.nextT += spb;
    }
  }
}
