/**
 * BLOCK BARONS' sound. The room: a low room tone, a far murmur of other tables, and a quiet lounge
 * trio (Rhodes, upright bass, brushes) for the Game House at night. On top, a physical sound for
 * every action: the dice rattling in a fist and clacking in the felt tray, wooden tokens tocking
 * space to space, ceramic chips clacking, cards sliding and snapping over, the deed stamp, the
 * auction gavel, the cell door, and stingers for wins and losses.
 *
 * Everything is synthesized (no files), through one table bus with a small room reverb, on the
 * party's audio context, so the city's sound switch (audio/master) mutes it. The adapter is this
 * module's `bus()`: point it at the shared engine's master bus once src/audio offers one.
 */
import { sound } from "../../party/kit";
import { master } from "../../audio/master";

type Pan = number;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

/** The lounge trio's changes: Dm9 · G13 · Cmaj9 · A7(b13), voiced for a soft Rhodes (midi). */
const CHANGES = [
  [50, 53, 57, 60, 64],
  [43, 53, 57, 59, 64],
  [48, 52, 55, 59, 62],
  [45, 55, 61, 65, 67],
];

export class TableSound {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private comp: DynamicsCompressorNode | null = null;
  private dry: GainNode | null = null;
  private wet: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private brown: AudioBuffer | null = null;
  private music: GainNode | null = null;
  private amb: GainNode | null = null;
  private beds: AudioScheduledSourceNode[] = [];
  private seq = 0;
  private next = 0;
  private bar = 0;
  private on = false;
  private unwatch: (() => void) | null = null;
  /** The player's own music switch (the room tone stays). */
  musicOn = true;

  constructor() {
    try {
      this.musicOn = localStorage.getItem("barons.music") !== "0";
    } catch {}
  }

  /** The adapter: the context and the bus this table's mix goes into (null: no sound). */
  private bus(): { ac: AudioContext; bus: GainNode } | null {
    return sound();
  }

  private ready() {
    if (this.closed) return false;
    if (this.ctx && this.out) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return master.on;
    }
    const s = this.bus();
    if (!s) return false;
    const ac = s.ac;
    this.ctx = ac;
    this.out = ac.createGain();
    this.out.gain.value = master.on ? 1.6 : 0;
    // a gentle glue on the whole table, so a burst of chips never clips
    const comp = (this.comp = ac.createDynamicsCompressor());
    comp.threshold.value = -16;
    comp.ratio.value = 3;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    this.out.connect(comp).connect(s.bus);
    this.dry = ac.createGain();
    this.dry.connect(this.out);
    // the room: a short, warm, wood-panelled lounge
    const verb = ac.createConvolver();
    verb.buffer = this.impulse(1.5, 2.6);
    this.wet = ac.createGain();
    const back = ac.createGain();
    back.gain.value = 0.5;
    this.wet.connect(verb).connect(back).connect(this.out);
    const n = ac.sampleRate * 2;
    this.noise = ac.createBuffer(1, n, ac.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.brown = ac.createBuffer(2, ac.sampleRate * 4, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const b = this.brown.getChannelData(c);
      let last = 0;
      for (let i = 0; i < b.length; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        b[i] = last * 3.5;
      }
    }
    this.unwatch = master.watch((v) => {
      if (!this.ctx || !this.out) return;
      const t = this.ctx.currentTime;
      this.out.gain.cancelScheduledValues(t);
      this.out.gain.setTargetAtTime(v ? 1.6 : 0, t, 0.08);
    });
    return master.on;
  }

  private impulse(len: number, decay: number) {
    const ac = this.ctx!;
    const n = Math.floor(ac.sampleRate * len);
    const b = ac.createBuffer(2, n, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const k = i / n;
        // darker as it decays (wood and curtains drink the highs)
        lp += (Math.random() * 2 - 1 - lp) * (0.55 - k * 0.4);
        d[i] = lp * Math.pow(1 - k, decay) * (i < ac.sampleRate * 0.012 ? i / (ac.sampleRate * 0.012) : 1);
      }
    }
    return b;
  }

  private send(node: AudioNode, wet: number, pan: Pan) {
    const ac = this.ctx!;
    let n: AudioNode = node;
    if (pan) {
      const p = ac.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      n.connect(p);
      n = p;
    }
    n.connect(this.dry!);
    if (wet > 0) {
      const g = ac.createGain();
      g.gain.value = wet;
      n.connect(g).connect(this.wet!);
    }
  }

  /** A burst of filtered noise (a click, a knock's body, a slide, a swish). */
  private nz(t: number, dur: number, type: BiquadFilterType, f: number, q: number, vol: number, wet = 0.1, pan: Pan = 0, attack = 0.001, f2 = 0, dest?: AudioNode) {
    const ac = this.ctx!;
    const s = ac.createBufferSource();
    s.buffer = this.noise;
    const fl = ac.createBiquadFilter();
    fl.type = type;
    fl.frequency.setValueAtTime(f, t);
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    fl.Q.value = q;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g);
    if (dest) g.connect(dest);
    else this.send(g, wet, pan);
    s.start(t, Math.random() * 1.5, dur + 0.05);
  }

  /** One tone with a quick attack and an exponential tail. */
  private tn(t: number, f: number, type: OscillatorType, vol: number, dur: number, wet = 0.1, o: { to?: number; a?: number; pan?: Pan; lp?: number; dest?: AudioNode } = {}) {
    const ac = this.ctx!;
    const os = ac.createOscillator();
    os.type = type;
    os.frequency.setValueAtTime(f, t);
    if (o.to) os.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    const g = ac.createGain();
    const a = o.a ?? 0.003;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dur);
    let n: AudioNode = os.connect(g);
    if (o.lp) {
      const f2 = ac.createBiquadFilter();
      f2.type = "lowpass";
      f2.frequency.value = o.lp;
      n = n.connect(f2);
    }
    if (o.dest) n.connect(o.dest);
    else this.send(n, wet, o.pan ?? 0);
    os.start(t);
    os.stop(t + a + dur + 0.05);
  }

  private get t() {
    return this.ctx!.currentTime + 0.005;
  }

  // ---- the room --------------------------------------------------------------------------------

  /** The room tone, the far tables and the lounge trio (fades in). */
  start() {
    if (this.on) return;
    if (!this.ready()) {
      // (no context yet: the browser waits for a gesture; try again on the first one)
      const once = () => {
        window.removeEventListener("pointerdown", once, true);
        window.removeEventListener("keydown", once, true);
        if (!this.on && !this.closed) this.start();
      };
      window.addEventListener("pointerdown", once, true);
      window.addEventListener("keydown", once, true);
      this.offGesture = () => {
        window.removeEventListener("pointerdown", once, true);
        window.removeEventListener("keydown", once, true);
      };
      return;
    }
    this.on = true;
    const ac = this.ctx!;
    const t = ac.currentTime;
    this.amb = ac.createGain();
    this.amb.gain.setValueAtTime(0, t);
    this.amb.gain.linearRampToValueAtTime(1, t + 2.5);
    this.amb.connect(this.dry!);
    // room tone: a low brown hum of the hall
    const bed = (buf: AudioBuffer, type: BiquadFilterType, f: number, q: number, vol: number) => {
      const s = ac.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      const fl = ac.createBiquadFilter();
      fl.type = type;
      fl.frequency.value = f;
      fl.Q.value = q;
      const g = ac.createGain();
      g.gain.value = vol;
      s.connect(fl).connect(g).connect(this.amb!);
      s.start(t, Math.random() * 3);
      this.beds.push(s);
      return { fl, g };
    };
    bed(this.brown!, "lowpass", 320, 0.6, 0.11);
    // the far tables: a murmur of voices, its vowel drifting slowly
    const mur = bed(this.brown!, "bandpass", 620, 1.4, 0.05);
    const lfo = ac.createOscillator();
    lfo.frequency.value = 0.13;
    const lg = ac.createGain();
    lg.gain.value = 180;
    lfo.connect(lg).connect(mur.fl.frequency);
    lfo.start(t);
    this.beds.push(lfo);
    const lfo2 = ac.createOscillator();
    lfo2.frequency.value = 0.07;
    const lg2 = ac.createGain();
    lg2.gain.value = 0.025;
    lfo2.connect(lg2).connect(mur.g.gain);
    lfo2.start(t);
    this.beds.push(lfo2);
    this.music = ac.createGain();
    this.music.gain.value = this.musicOn ? 0.55 : 0;
    this.music.connect(this.dry!);
    const mwet = ac.createGain();
    mwet.gain.value = 0.35;
    this.music.connect(mwet).connect(this.wet!);
    this.next = t + 0.6;
    this.bar = 0;
    this.seq = window.setInterval(() => this.schedule(), 200);
    this.schedule();
  }
  private offGesture: (() => void) | null = null;
  private closed = false;

  setMusic(on: boolean) {
    this.musicOn = on;
    try {
      localStorage.setItem("barons.music", on ? "1" : "0");
    } catch {}
    if (this.ctx && this.music) this.music.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.3);
  }

  /** The trio, scheduled a little ahead (one bar of 4 at 74 bpm per chord). */
  private schedule() {
    if (!this.ctx || !this.music || !this.on) return;
    const ac = this.ctx;
    const beat = 60 / 74;
    const m = this.music;
    while (this.next < ac.currentTime + 1.2) {
      const t0 = this.next;
      const ch = CHANGES[this.bar % CHANGES.length];
      // Rhodes: the chord on 1 (soft), a re-voiced stab on the "and" of 2
      const keys = (tt: number, v: number) => {
        for (let k = 1; k < ch.length; k++) {
          const f = midi(ch[k]);
          const at = tt + k * 0.012 + Math.random() * 0.01;
          this.tn(at, f, "sine", v, beat * 2.6, 0, { a: 0.008, dest: m });
          this.tn(at, f * 3, "sine", v * 0.09, 0.4, 0, { a: 0.004, dest: m });
        }
      };
      keys(t0, 0.03);
      if (Math.random() < 0.7) keys(t0 + beat * 1.5, 0.018);
      // upright bass: root, fifth, a walk-up into the next chord
      const nxt = CHANGES[(this.bar + 1) % CHANGES.length][0];
      const walk = [ch[0], ch[0] + 7, ch[0] + (Math.random() < 0.5 ? 3 : 5), nxt + (nxt > ch[0] ? -1 : 1)];
      walk.forEach((n, i) => {
        const at = t0 + i * beat;
        this.tn(at, midi(n - 12), "sine", 0.11, beat * 0.9, 0, { a: 0.012, lp: 600, dest: m });
        this.tn(at, midi(n - 12) * 2, "triangle", 0.025, 0.12, 0, { a: 0.004, lp: 900, dest: m });
      });
      // brushes: a swish on 2 and 4, a soft tap on the off-beats
      for (let b = 0; b < 4; b++) {
        const at = t0 + b * beat;
        if (b % 2) this.nz(at, beat * 0.55, "bandpass", 5200, 0.8, 0.018, 0, 0, 0.06, 3800, m);
        this.nz(at + beat * 0.66, 0.05, "highpass", 6500, 0.7, 0.008, 0, 0, 0.002, 0, m);
      }
      // now and then a few notes of melody from the chord, an octave up
      if (this.bar % 2 === 1 && Math.random() < 0.6)
        for (let i = 0; i < 3; i++) {
          if (Math.random() < 0.35) continue;
          const n = ch[1 + Math.floor(Math.random() * (ch.length - 1))] + 12;
          this.tn(t0 + beat * (0.5 + i * 1.1 + Math.random() * 0.2), midi(n), "sine", 0.022, beat * 1.3, 0, { a: 0.01, dest: m });
        }
      // the far tables: a riffle of chips, a die, once in a while
      if (Math.random() < 0.22) {
        const at = t0 + Math.random() * beat * 4;
        const p = rnd(-0.8, 0.8);
        for (let k = 0; k < 4 + Math.random() * 5; k++) this.nz(at + k * rnd(0.03, 0.06), 0.02, "bandpass", rnd(3800, 5200), 4, 0.012, 0.5, p);
      }
      this.next += beat * 4;
      this.bar++;
    }
  }

  /** Fade the room out and let go of it (the table closes). */
  stop() {
    this.closed = true;
    this.offGesture?.();
    clearInterval(this.seq);
    this.unwatch?.();
    this.unwatch = null;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.on = false;
    this.out?.gain.setTargetAtTime(0, t + 0.5, 0.1);
    for (const g of [this.amb, this.music]) {
      if (!g) continue;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0, t + 0.6);
    }
    const beds = this.beds;
    this.beds = [];
    const out = this.out;
    const comp = this.comp;
    setTimeout(() => {
      for (const b of beds)
        try {
          b.stop();
        } catch {}
      out?.disconnect();
      comp?.disconnect();
    }, 900);
  }

  // ---- the actions -----------------------------------------------------------------------------

  /** A card-stock button pressed. */
  ui(k = 0) {
    if (!this.ready()) return;
    const t = this.t;
    this.nz(t, 0.035, "bandpass", 2400 + k * 200, 1.6, 0.16, 0.05);
    this.tn(t, 210 + k * 12, "sine", 0.1, 0.04, 0);
  }
  /** A tiny tick (a picker, a counter). */
  tick(k = 0) {
    if (!this.ready()) return;
    this.nz(this.t, 0.02, "bandpass", 3600 + k * 300, 3, 0.1, 0.02);
  }

  /** The dice rattling in a closed fist. */
  rattle() {
    if (!this.ready()) return;
    const t = this.t;
    for (let k = 0; k < 9; k++) {
      const at = t + k * rnd(0.028, 0.05);
      this.nz(at, 0.025, "bandpass", rnd(2600, 4200), 5, rnd(0.08, 0.16), 0.05, rnd(-0.2, 0.2));
      if (k % 3 === 0) this.tn(at, rnd(900, 1300), "triangle", 0.04, 0.02, 0);
    }
  }
  /** A die hitting the felt (floor) or the tray's wooden wall; `s` 0…1 how hard. */
  clack(s: number, wall = false, pan: Pan = 0) {
    if (!this.ready() || s < 0.04) return;
    const t = this.t;
    const v = Math.min(1, s);
    if (wall) {
      this.tn(t, rnd(300, 380), "triangle", 0.22 * v, 0.07, 0.15, { pan });
      this.nz(t, 0.05, "bandpass", 1100, 2, 0.28 * v, 0.15, pan);
    } else {
      this.tn(t, rnd(140, 180), "sine", 0.3 * v, 0.07, 0.05, { to: 70, pan });
      this.nz(t, 0.04, "bandpass", rnd(1800, 2600), 2.2, 0.32 * v, 0.1, pan);
      this.nz(t, 0.012, "highpass", 5000, 0.7, 0.12 * v, 0.05, pan);
    }
  }
  /** Two dice knocking together. */
  knock(s: number) {
    if (!this.ready() || s < 0.05) return;
    const t = this.t;
    this.tn(t, rnd(1700, 2100), "sine", 0.12 * Math.min(1, s), 0.03, 0.05);
    this.nz(t, 0.02, "bandpass", 4200, 4, 0.2 * Math.min(1, s), 0.05);
  }

  /** A wooden token landing on the board; `k` the step (a slight walk in pitch). */
  tock(k = 0, last = false) {
    if (!this.ready()) return;
    const t = this.t;
    const f = [620, 680, 650, 720][k % 4] * (last ? 0.82 : 1);
    this.tn(t, f, "sine", last ? 0.2 : 0.13, last ? 0.09 : 0.05, 0.05, { to: f * 0.8 });
    this.nz(t, 0.025, "bandpass", 1900, 3, last ? 0.2 : 0.12, 0.05);
    if (last) this.tn(t, 160, "sine", 0.14, 0.08, 0, { to: 90 });
  }
  /** A long leap through the air (to the Penitentiary). */
  swoosh() {
    if (!this.ready()) return;
    this.nz(this.t, 0.5, "bandpass", 500, 1.2, 0.16, 0.2, 0, 0.18, 2600);
  }

  /** One ceramic chip clacking on another. */
  chip(pan: Pan = 0) {
    if (!this.ready()) return;
    const t = this.t;
    const f = rnd(2900, 3600);
    this.tn(t, f, "sine", 0.07, 0.035, 0.08, { pan });
    this.tn(t, f * 1.47, "sine", 0.04, 0.025, 0.08, { pan });
    this.nz(t, 0.018, "bandpass", rnd(4200, 5600), 3, 0.15, 0.08, pan);
  }
  /** A short run of chips being stacked (n chips). */
  chips(n = 4, pan: Pan = 0) {
    if (!this.ready()) return;
    const t = this.t;
    for (let k = 0; k < n; k++) {
      const at = t + k * rnd(0.04, 0.07);
      const f = rnd(2800, 3700) * (1 - k * 0.01);
      this.tn(at, f, "sine", 0.06, 0.035, 0.08, { pan });
      this.nz(at, 0.016, "bandpass", rnd(4200, 5800), 3, 0.13, 0.08, pan);
    }
  }

  /** A card slid off the deck. */
  cardSlide() {
    if (!this.ready()) return;
    this.nz(this.t, 0.22, "highpass", 1600, 0.6, 0.12, 0.05, 0, 0.05, 2600);
  }
  /** A card snapped face up. */
  cardFlip() {
    if (!this.ready()) return;
    const t = this.t;
    this.nz(t, 0.03, "bandpass", 3200, 1.5, 0.22, 0.05);
    this.tn(t, 240, "sine", 0.08, 0.04, 0);
  }
  /** Paper on the table (a deed laid down, a slip). */
  paper() {
    if (!this.ready()) return;
    this.nz(this.t, 0.12, "bandpass", 2400, 0.8, 0.1, 0.05, 0, 0.02, 1200);
  }

  /** The rubber stamp on a deed. */
  stamp() {
    if (!this.ready()) return;
    const t = this.t;
    this.tn(t, 110, "sine", 0.32, 0.12, 0.08, { to: 60 });
    this.nz(t, 0.07, "lowpass", 900, 0.8, 0.3, 0.1);
    this.nz(t + 0.004, 0.05, "bandpass", 2600, 1.2, 0.08, 0.05);
  }
  /** The auctioneer's gavel (n knocks). */
  gavel(n = 1) {
    if (!this.ready()) return;
    const t = this.t;
    for (let k = 0; k < n; k++) {
      const at = t + k * 0.16;
      this.tn(at, 240, "triangle", 0.3, 0.1, 0.25, { to: 180 });
      this.nz(at, 0.06, "bandpass", 1300, 2, 0.32, 0.25);
    }
  }
  /** A wooden building block set down on the board, and a little ring of pride. */
  build(level: number) {
    if (!this.ready()) return;
    const t = this.t;
    this.tn(t, 420, "triangle", 0.18, 0.06, 0.1);
    this.nz(t, 0.04, "bandpass", 1500, 3, 0.2, 0.1);
    this.tn(t + 0.07, midi(76 + level * 2), "sine", 0.07, 0.4, 0.3);
  }
  /** A Foundry rising: a heavy set-down and a warm chord. */
  foundry() {
    if (!this.ready()) return;
    const t = this.t;
    this.tn(t, 90, "sine", 0.35, 0.25, 0.2, { to: 55 });
    this.nz(t, 0.12, "lowpass", 700, 0.8, 0.3, 0.2);
    [64, 68, 71, 76].forEach((n, i) => this.tn(t + 0.12 + i * 0.06, midi(n), "sine", 0.07, 1.0, 0.4));
  }
  /** Selling a building back: a block lifted off. */
  unbuild() {
    if (!this.ready()) return;
    const t = this.t;
    this.tn(t, 520, "triangle", 0.12, 0.05, 0.1, { to: 380 });
    this.nz(t, 0.03, "bandpass", 2000, 3, 0.12, 0.05);
  }

  /** The block reward (passing GENESIS): two bright glints. */
  reward() {
    if (!this.ready()) return;
    const t = this.t;
    this.tn(t, midi(84), "sine", 0.08, 0.25, 0.3);
    this.tn(t + 0.07, midi(91), "sine", 0.07, 0.4, 0.3);
    this.chips(3);
  }
  /** The cell door slams (ZEC STATE PENITENTIARY). */
  cell() {
    if (!this.ready()) return;
    const t = this.t;
    for (const [f, v] of [
      [196, 0.16],
      [311, 0.1],
      [467, 0.08],
      [733, 0.05],
      [1093, 0.03],
    ])
      this.tn(t, f, "triangle", v, 0.9, 0.45);
    this.nz(t, 0.12, "bandpass", 900, 1.5, 0.35, 0.4);
    this.tn(t + 0.18, midi(45), "sawtooth", 0.05, 0.8, 0.3, { lp: 500 });
  }
  /** Out of the cell: a key turns, two notes up. */
  free() {
    if (!this.ready()) return;
    const t = this.t;
    this.nz(t, 0.03, "bandpass", 3000, 4, 0.18, 0.1);
    this.nz(t + 0.08, 0.03, "bandpass", 2600, 4, 0.18, 0.1);
    this.tn(t + 0.12, midi(72), "sine", 0.08, 0.2, 0.3);
    this.tn(t + 0.24, midi(79), "sine", 0.08, 0.35, 0.3);
  }
  /** It's your turn: a soft desk bell. */
  turn() {
    if (!this.ready()) return;
    const t = this.t;
    this.tn(t, 1320, "sine", 0.09, 1.1, 0.35);
    this.tn(t, 1320 * 2.76, "sine", 0.02, 0.4, 0.35);
    this.tn(t, 660, "sine", 0.04, 0.6, 0.3);
  }
  /** A new round: a page turned and a low wood tap. */
  round() {
    if (!this.ready()) return;
    this.nz(this.t, 0.16, "bandpass", 1800, 0.7, 0.08, 0.1, 0, 0.04, 900);
    this.tn(this.t + 0.05, 330, "triangle", 0.06, 0.08, 0.2);
  }
  /** A deal is signed: a pen scratch and a bright major chord. */
  deal() {
    if (!this.ready()) return;
    const t = this.t;
    for (let k = 0; k < 4; k++) this.nz(t + k * 0.05, 0.04, "bandpass", rnd(3000, 4500), 2, 0.07, 0.05);
    [60, 64, 67, 72].forEach((n, i) => this.tn(t + 0.22 + i * 0.04, midi(n), "sine", 0.07, 0.8, 0.35));
  }
  /** No deal: two low, flat notes. */
  nodeal() {
    if (!this.ready()) return;
    const t = this.t;
    this.tn(t, midi(55), "triangle", 0.08, 0.16, 0.2);
    this.tn(t + 0.16, midi(51), "triangle", 0.08, 0.3, 0.2);
  }
  /** A trade offer arrives: a paper slip and a "psst" chime. */
  offer() {
    if (!this.ready()) return;
    this.paper();
    this.tn(this.t + 0.08, midi(79), "sine", 0.06, 0.3, 0.3);
    this.tn(this.t + 0.18, midi(84), "sine", 0.05, 0.4, 0.3);
  }
  /** Doubles: a quick bright double tap. */
  doubles() {
    if (!this.ready()) return;
    const t = this.t;
    this.tn(t, midi(81), "sine", 0.08, 0.15, 0.3);
    this.tn(t + 0.09, midi(81), "sine", 0.08, 0.3, 0.3);
  }
  /** Big rent paid: a heavy pour of chips and a low thump. */
  bigPay() {
    if (!this.ready()) return;
    this.tn(this.t, 120, "sine", 0.18, 0.2, 0.15, { to: 70 });
    this.chips(9);
  }
  /** Win stinger: the trio lands on a bright major 9 arpeggio. */
  win() {
    if (!this.ready()) return;
    const t = this.t;
    [60, 64, 67, 71, 74, 79].forEach((n, i) => {
      this.tn(t + i * 0.09, midi(n), "sine", 0.09, 1.6, 0.4);
      this.tn(t + i * 0.09, midi(n) * 2, "sine", 0.015, 0.4, 0.4);
    });
    this.tn(t, midi(36), "sine", 0.18, 1.5, 0.2);
    this.chips(8);
  }
  /** Lose stinger: a minor fall, a soft low end. */
  lose() {
    if (!this.ready()) return;
    const t = this.t;
    [67, 63, 60, 55].forEach((n, i) => this.tn(t + i * 0.18, midi(n), "sine", 0.08, i === 3 ? 1.4 : 0.4, 0.4));
    this.tn(t + 0.54, midi(31), "sine", 0.14, 1.4, 0.2);
  }
  /** A baron goes bankrupt: chips spill, a long low note. */
  bankrupt() {
    if (!this.ready()) return;
    const t = this.t;
    for (let k = 0; k < 10; k++) this.nz(t + k * rnd(0.03, 0.07), 0.02, "bandpass", rnd(3500, 5500) * (1 - k * 0.03), 3, 0.12, 0.2, rnd(-0.5, 0.5));
    this.tn(t + 0.3, midi(38), "sawtooth", 0.06, 1.3, 0.3, { lp: 400 });
    this.tn(t + 0.3, midi(50), "sine", 0.06, 1.0, 0.3);
  }
}

