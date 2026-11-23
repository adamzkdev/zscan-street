import "./radio.css";
import { load } from "../audio/samples";
import type { AudioOut } from "./sound";

/**
 * The car radio (src/gta): get in a car and the station you left on comes in, like the games do —
 * Q (or , . or the pad's left/right) changes it, through to "radio off". Four stations:
 *
 *  - Neon Proof FM: synthwave, played live (a drum machine, a pulsing bass, a pad, an arpeggio
 *    through a dotted-eighth delay), a new "song" every 32 bars, its key and progression drawn;
 *  - Block Radio: lo-fi beats under a DJ (the browser's voice) who reads each new block as it lands;
 *  - Shielded Jazz and ZK Classic: the city's own recordings (public/audio/music), one after another.
 *
 * Everything goes through the street's master (the sound button and its fades rule it).
 */

type Kind = "synth" | "lofi" | "files";
interface Station {
  name: string;
  freq: string;
  tag: string;
  kind: Kind;
  tracks?: [string, string][];
}

const STATIONS: Station[] = [
  { name: "Neon Proof FM", freq: "101.3", tag: "Synthwave", kind: "synth" },
  { name: "Block Radio", freq: "96.6", tag: "Lo-fi · the chain, live", kind: "lofi" },
  {
    name: "Shielded Jazz",
    freq: "88.4",
    tag: "Jazz · late night",
    kind: "files",
    tracks: [
      ["jazz-combo", "Combo at the Mempool"],
      ["sax-park", "Sax in the Park"],
      ["jazz-dixie", "Dixie Shielded"],
      ["piano-nocturne", "Nocturne"],
      ["sax-solo", "Solo, Ring Road"],
      ["piano-gymnopedie", "Gymnopédie"],
      ["piano-waltz", "Waltz"],
    ],
  },
  {
    name: "ZK Classic",
    freq: "104.7",
    tag: "Classical",
    kind: "files",
    tracks: [
      ["op-danube", "The Blue Danube"],
      ["op-figaro", "The Marriage of Figaro"],
      ["op-vivaldi", "The Four Seasons"],
      ["op-toreador", "Carmen · Toreador"],
      ["op-mountainking", "In the Hall of the Mountain King"],
      ["violin-bach", "Bach · Partita"],
      ["op-newworld", "From the New World"],
      ["op-swanlake", "Swan Lake"],
      ["op-traviata", "La Traviata"],
      ["op-puccini", "Puccini"],
      ["op-beethoven5", "Symphony No. 5"],
      ["op-badinerie", "Badinerie"],
    ],
  },
];

const KEY = "zstreet.gta.radio";
const LEVEL = 0.34;
const LOOK = 0.3;

const SONG_A = ["Midnight", "Shielded", "Neon", "Orchard", "Sapling", "Halo", "Viewing Key", "Nullifier", "Coinbase", "Ring Road", "Ocean", "Chrome", "Sunset", "Bay"];
const SONG_B = ["Drive", "Highway", "Nights", "Mempool", "Dreams", "Proof", "Horizon", "Run", "Boulevard", "Heat", "Signal", "Lights", "Memory", "Pool"];
const ARTISTS = ["Zatoshi", "The Nullifiers", "Groth Sixteen", "Halo Kids", "Jubjub", "Pedersen", "Blake Two", "Equihash", "Sinsemilla"];

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/** Progressions as scale degrees in a minor key (semitones from the root, chord built on it). */
const PROGS: [number, "m" | "M"][][] = [
  [
    [0, "m"],
    [8, "M"],
    [3, "M"],
    [10, "M"],
  ],
  [
    [0, "m"],
    [5, "m"],
    [8, "M"],
    [7, "M"],
  ],
  [
    [8, "M"],
    [10, "M"],
    [0, "m"],
    [0, "m"],
  ],
  [
    [0, "m"],
    [10, "M"],
    [8, "M"],
    [10, "M"],
  ],
];
/** Lo-fi: seventh chords in a major key (root offset, quality). */
const LOFI: [number, number[]][][] = [
  [
    [0, [0, 4, 7, 11]],
    [9, [0, 3, 7, 10]],
    [2, [0, 3, 7, 10]],
    [7, [0, 4, 7, 10]],
  ],
  [
    [5, [0, 4, 7, 11]],
    [4, [0, 3, 7, 10]],
    [2, [0, 3, 7, 10]],
    [0, [0, 4, 7, 11]],
  ],
];

export class CarRadio {
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private duck: GainNode | null = null;
  private delay: { in: GainNode; dl: DelayNode } | null = null;
  private noise: AudioBuffer | null = null;
  private el: HTMLElement;
  private hideT = 0;
  /** The station (−1: off), kept between cars and visits. */
  index = 0;
  private playing = -1;
  private inCar = false;
  // the live engines' clock
  private next = 0;
  private step = 0;
  private song = { root: 57, prog: PROGS[0], title: "", artist: "", bpm: 104, bars: 0 };
  private lofi = { root: 60, prog: LOFI[0], bpm: 78 };
  // the recordings' player
  private file: { src: AudioBufferSourceNode; env: GainNode } | null = null;
  private fileI = 0;
  private fileToken = 0;
  private crackle: AudioBufferSourceNode | null = null;
  private lastBlock = 0;
  private speaking = false;

  constructor(
    private get: () => AudioOut | null,
    ui: HTMLElement,
    private live: { height(): number; mempool(): number },
  ) {
    try {
      const v = Number(localStorage.getItem(KEY));
      if (Number.isInteger(v) && v >= -1 && v < STATIONS.length) this.index = v;
    } catch {}
    this.el = document.createElement("div");
    this.el.className = "gta-radio";
    this.el.setAttribute("aria-live", "polite");
    ui.append(this.el);
  }

  /** In a car (on) or out of it (off): the station comes in or fades out. */
  car(on: boolean) {
    if (on === this.inCar) return;
    this.inCar = on;
    if (on) {
      this.tune(true);
      this.show();
    } else this.silence(0.6);
  }

  /** The next (or the previous) station, through "radio off". */
  turn(d: 1 | -1) {
    const n = STATIONS.length + 1;
    this.index = ((((this.index + 1 + d) % n) + n) % n) - 1;
    try {
      localStorage.setItem(KEY, String(this.index));
    } catch {}
    if (this.inCar) this.tune(false);
    this.show();
  }

  /** Each frame: the live stations' notes a little ahead, the DJ when a block lands. */
  update(dt: number) {
    if (this.hideT > 0 && (this.hideT -= dt) <= 0) this.el.classList.remove("on");
    if (!this.inCar || this.playing < 0) return;
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const st = STATIONS[this.playing];
    if (st.kind === "files") return;
    if (this.next < ctx.currentTime) this.next = ctx.currentTime + 0.05;
    while (this.next < ctx.currentTime + LOOK) {
      if (st.kind === "synth") this.synthStep(this.next);
      else this.lofiStep(this.next);
      const bpm = st.kind === "synth" ? this.song.bpm : this.lofi.bpm;
      // (lo-fi swings its eighths: the off-beat sixteenths late)
      const base = 60 / bpm / 4;
      this.next += st.kind === "lofi" ? base * (this.step % 2 ? 0.84 : 1.16) : base;
      this.step++;
    }
    if (st.kind === "lofi") {
      const h = this.live.height();
      if (h && h !== this.lastBlock) {
        const first = this.lastBlock === 0;
        this.lastBlock = h;
        if (!first) this.dj(h);
      }
    }
  }

  dispose() {
    this.silence(0.2);
    this.el.remove();
  }

  // ---- the graph -----------------------------------------------------------------------------------

  private ready() {
    const a = this.get();
    if (!a) return false;
    if (a.ctx !== this.ctx) {
      this.ctx = a.ctx;
      const ctx = a.ctx;
      this.bus = ctx.createGain();
      this.bus.gain.value = 0;
      this.duck = ctx.createGain();
      // (a car's speakers: a little less top, a little more middle)
      const shelf = ctx.createBiquadFilter();
      shelf.type = "highshelf";
      shelf.frequency.value = 6500;
      shelf.gain.value = -4;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 3;
      this.bus.connect(this.duck).connect(shelf).connect(comp).connect(a.out);
      this.makeDelay();
      const n = ctx.sampleRate;
      this.noise = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    return a.ctx.state === "running";
  }

  /** On air: the station now (from where it "was", as if it had played all along). */
  private tune(entering: boolean) {
    this.silence(entering ? 0.05 : 0.25);
    this.playing = this.index;
    if (this.playing < 0 || !this.ready()) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    this.bus!.gain.cancelScheduledValues(t);
    this.bus!.gain.setValueAtTime(0, t);
    this.bus!.gain.linearRampToValueAtTime(LEVEL, t + (entering ? 0.8 : 0.35));
    const st = STATIONS[this.playing];
    this.next = t + 0.08;
    this.step = Math.floor(Math.random() * 4) * 16;
    if (st.kind === "synth") this.newSong();
    else if (st.kind === "lofi") {
      this.lofi = { root: 57 + Math.floor(Math.random() * 7), prog: pick(LOFI), bpm: 74 + Math.floor(Math.random() * 10) };
      this.vinyl(true);
      this.lastBlock = this.live.height();
    } else {
      this.fileI = Math.floor(Math.random() * st.tracks!.length);
      void this.playFile(true);
    }
  }

  private silence(fade: number) {
    this.playing = -1;
    this.fileToken++;
    if (!this.ctx || !this.bus) return;
    const t = this.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setValueAtTime(this.bus.gain.value, t);
    this.bus.gain.linearRampToValueAtTime(0, t + fade);
    const f = this.file;
    this.file = null;
    if (f)
      setTimeout(
        () => {
          try {
            f.src.stop();
          } catch {}
          f.env.disconnect();
        },
        fade * 1000 + 80,
      );
    this.vinyl(false);
    if (this.speaking && "speechSynthesis" in window) speechSynthesis.cancel();
    // (the old station's notes, already scheduled, are under the faded bus: the new one starts clean)
    if (fade > 0.1) {
      const old = this.bus;
      this.bus = this.ctx.createGain();
      this.bus.gain.value = 0;
      this.bus.connect(this.duck!);
      setTimeout(() => old.disconnect(), fade * 1000 + 600);
      // a fresh delay into the new bus (the old one's echoes die with the old bus)
      this.makeDelay();
    }
  }

  /** The arpeggio's dotted-eighth delay (and a bit of room for the snare), into the bus. */
  private makeDelay() {
    const ctx = this.ctx!;
    const din = ctx.createGain();
    const dl = ctx.createDelay(2);
    dl.delayTime.value = (60 / this.song.bpm) * 0.75;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const dlp = ctx.createBiquadFilter();
    dlp.type = "lowpass";
    dlp.frequency.value = 2400;
    din.connect(dl).connect(dlp).connect(fb).connect(dl);
    dlp.connect(this.bus!);
    this.delay = { in: din, dl };
  }

  // ---- the banner ----------------------------------------------------------------------------------

  private show() {
    const i = this.index;
    if (i < 0) this.el.innerHTML = `<b>Radio off</b>`;
    else {
      const st = STATIONS[i];
      const now = st.kind === "synth" ? `${this.song.artist} · ${this.song.title}` : st.kind === "files" ? (st.tracks![this.fileI]?.[1] ?? "") : "Beats to drive to · blocks as they land";
      this.el.innerHTML = `<b>${st.name}</b><span>${st.freq} FM · ${st.tag}</span>${now ? `<i>${now}</i>` : ""}`;
    }
    this.el.classList.add("on");
    this.hideT = 3.2;
  }

  // ---- Neon Proof FM: synthwave ---------------------------------------------------------------------

  private newSong() {
    const roots = [57, 52, 55, 50, 53, 59];
    const bpm = 96 + Math.floor(Math.random() * 16);
    this.song = { root: pick(roots), prog: pick(PROGS), title: `${pick(SONG_A)} ${pick(SONG_B)}`, artist: pick(ARTISTS), bpm, bars: 0 };
    // (the delay in time with the song)
    if (this.delay && this.ctx) this.delay.dl.delayTime.setValueAtTime((60 / bpm) * 0.75, this.ctx.currentTime);
  }

  private synthStep(t: number) {
    const s16 = this.step % 16;
    const bar = Math.floor(this.step / 16);
    // a new song every 32 bars (a short break of drums between)
    if (s16 === 0 && bar > 0 && bar % 32 === 0) {
      this.newSong();
      if (this.inCar && this.playing === 0) this.show();
    }
    const S = this.song;
    const [deg, q] = S.prog[bar % S.prog.length];
    const root = S.root + deg;
    const chord = q === "m" ? [0, 3, 7] : [0, 4, 7];
    const part = bar % 32;
    const intro = part < 2;
    const beat = 60 / S.bpm;
    // drums: four on the floor, a big snare on 2 and 4, hats on the off-beats, a fill every 8 bars
    if (s16 % 4 === 0 && !intro) this.kick(t, 0.9);
    if ((s16 === 4 || s16 === 12) && !intro) this.snare(t, 0.55, true);
    if (s16 % 4 === 2) this.hat(t, 0.16, 0.06);
    if (s16 % 2 === 1 && part % 8 >= 4) this.hat(t, 0.06, 0.03);
    if (part % 8 === 7 && s16 >= 12) this.snare(t, 0.25 + (s16 - 12) * 0.08, false);
    // bass: driving eighths on the root, an octave jump on the last
    if (s16 % 2 === 0 && !intro) this.bass(t, midi(root - 24 + (s16 === 14 ? 12 : 0)), beat / 2.2);
    // the pad: the chord, a bar long
    if (s16 === 0) for (const n of chord) this.pad(t, midi(root + n), beat * 4);
    // the arpeggio: up and down the chord, two octaves, into the delay
    if (part >= 4) {
      const seq = [0, 1, 2, 3, 2, 1, 0, 2];
      const k = seq[s16 % 8];
      const n = root + 12 + (k === 3 ? 12 : chord[k]);
      this.arp(t, midi(n), beat / 4.5, part % 16 >= 8 ? 0.07 : 0.05);
    }
    // a lead now and then: the chord's top note, held
    if (part >= 16 && part < 28 && s16 === 0 && bar % 2 === 0) this.lead(t, midi(root + 24 + chord[2] - (bar % 4 === 0 ? 0 : 5)), beat * 3.5);
  }

  private out(level: number) {
    const g = this.ctx!.createGain();
    g.gain.value = level;
    g.connect(this.bus!);
    return g;
  }

  private kick(t: number, v: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = this.out(0);
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.35);
  }

  private snare(t: number, v: number, room: boolean) {
    const ctx = this.ctx!;
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800;
    bp.Q.value = 0.7;
    const g = this.out(0);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (room ? 0.42 : 0.12));
    n.connect(bp).connect(g);
    if (room && this.delay) {
      const send = ctx.createGain();
      send.gain.value = 0.18;
      g.connect(send).connect(this.delay.in);
    }
    n.start(t, Math.random() * 0.5);
    n.stop(t + 0.45);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
    const og = this.out(0);
    og.gain.setValueAtTime(v * 0.5, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(og);
    o.start(t);
    o.stop(t + 0.12);
  }

  private hat(t: number, v: number, len: number) {
    const ctx = this.ctx!;
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7500;
    const g = this.out(0);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    n.connect(hp).connect(g);
    n.start(t, Math.random() * 0.5);
    n.stop(t + len + 0.02);
  }

  private bass(t: number, f: number, len: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = f;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 6;
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(180, t + len);
    const g = this.out(0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    o.connect(lp).connect(g);
    o.start(t);
    o.stop(t + len + 0.02);
  }

  private pad(t: number, f: number, len: number) {
    const ctx = this.ctx!;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1600;
    const g = this.out(0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.045, t + 0.4);
    g.gain.setValueAtTime(0.045, t + len - 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + len + 0.25);
    lp.connect(g);
    for (const d of [-9, 0, 8]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.detune.value = d;
      o.connect(lp);
      o.start(t);
      o.stop(t + len + 0.3);
    }
  }

  private arp(t: number, f: number, len: number, v: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = "square";
    o.frequency.value = f;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 3200;
    const g = this.out(0);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    o.connect(lp).connect(g);
    if (this.delay) {
      const send = ctx.createGain();
      send.gain.value = 0.55;
      g.connect(send).connect(this.delay.in);
    }
    o.start(t);
    o.stop(t + len + 0.02);
  }

  private lead(t: number, f: number, len: number) {
    const ctx = this.ctx!;
    const g = this.out(0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.06);
    g.gain.setValueAtTime(0.05, t + len * 0.7);
    g.gain.linearRampToValueAtTime(0.0001, t + len);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2600;
    lp.connect(g);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.2;
    const vg = ctx.createGain();
    vg.gain.value = 6;
    vib.connect(vg);
    for (const d of [-6, 6]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.detune.value = d;
      vg.connect(o.detune);
      o.connect(lp);
      o.start(t);
      o.stop(t + len + 0.05);
    }
    vib.start(t);
    vib.stop(t + len + 0.05);
    if (this.delay) {
      const send = ctx.createGain();
      send.gain.value = 0.4;
      g.connect(send).connect(this.delay.in);
    }
  }

  // ---- Block Radio: lo-fi and the DJ ----------------------------------------------------------------

  private lofiStep(t: number) {
    const s16 = this.step % 16;
    const bar = Math.floor(this.step / 16);
    const L = this.lofi;
    const [deg, chord] = L.prog[bar % L.prog.length];
    const root = L.root + deg;
    const beat = 60 / L.bpm;
    // a lazy beat: kick on 1 and the "and" of 2, a soft snare on 2 and 4, brushed hats
    if (s16 === 0 || s16 === 6 || (s16 === 10 && bar % 2)) this.kick(t, 0.55);
    if (s16 === 4 || s16 === 12) this.snare(t, 0.22, false);
    if (s16 % 2 === 0) this.hat(t, 0.05 + (s16 % 4 === 2 ? 0.03 : 0), 0.05);
    // keys: the seventh chord, a little late, a little rolled
    if (s16 === 0 || (s16 === 10 && bar % 2 === 1)) chord.forEach((n, i) => this.keys(t + i * 0.018 + 0.01, midi(root + n), beat * (s16 === 0 ? 2.6 : 1.2)));
    // a round bass
    if (s16 === 0 || s16 === 7) {
      const ctx = this.ctx!;
      const o = ctx.createOscillator();
      o.frequency.value = midi(root - 24 + (s16 === 7 ? 7 : 0));
      const g = this.out(0);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + beat * 1.4);
      o.connect(g);
      o.start(t);
      o.stop(t + beat * 1.5);
    }
  }

  /** An electric piano, soft: a sine and its bell partial, fading. */
  private keys(t: number, f: number, len: number) {
    const ctx = this.ctx!;
    const g = this.out(0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2200;
    lp.connect(g);
    const o = ctx.createOscillator();
    o.frequency.value = f;
    o.connect(lp);
    const b = ctx.createOscillator();
    b.frequency.value = f * 3.01;
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0.25, t);
    bg.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    b.connect(bg).connect(lp);
    for (const x of [o, b]) {
      x.start(t);
      x.stop(t + len + 0.05);
    }
  }

  /** The record's crackle under the lo-fi. */
  private vinyl(on: boolean) {
    if (this.crackle) {
      try {
        this.crackle.stop();
      } catch {}
      this.crackle = null;
    }
    if (!on || !this.ctx || !this.noise) return;
    const ctx = this.ctx;
    const n = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() < 0.0009 ? (Math.random() * 2 - 1) * 0.9 : 0) + (Math.random() * 2 - 1) * 0.012;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 5000;
    const g = this.out(0.5);
    src.connect(lp).connect(g);
    src.start();
    this.crackle = src;
  }

  /** The DJ reads the block that just landed (the music ducks under the voice). */
  private dj(h: number) {
    if (!("speechSynthesis" in window) || this.speaking) return;
    const m = this.live.mempool();
    const lines = [
      `Block Radio. Block ${h.toLocaleString("en-US")} just landed. ${m ? `${m} transactions still waiting in the mempool.` : "The mempool is empty."} Stay shielded.`,
      `New block on the chain, number ${h.toLocaleString("en-US")}. You're on Block Radio, ninety-six point six.`,
      `That was block ${h.toLocaleString("en-US")}. ${m ? `${m} in the mempool, ` : ""}the beat goes on.`,
    ];
    const u = new SpeechSynthesisUtterance(pick(lines));
    const vs = speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
    const v = vs.find((x) => /Daniel|Samantha|Google UK English Male|Alex/.test(x.name)) ?? vs[0];
    if (v) u.voice = v;
    u.rate = 1.02;
    u.pitch = 0.92;
    u.volume = 0.9;
    const duck = this.duck;
    const ctx = this.ctx;
    if (duck && ctx) duck.gain.setTargetAtTime(0.35, ctx.currentTime, 0.2);
    this.speaking = true;
    u.onend = u.onerror = () => {
      this.speaking = false;
      if (duck && ctx) duck.gain.setTargetAtTime(1, ctx.currentTime, 0.4);
    };
    speechSynthesis.speak(u);
  }

  // ---- the recordings --------------------------------------------------------------------------------

  private async playFile(first: boolean) {
    const st = STATIONS[this.playing];
    if (!st?.tracks || !this.ctx || !this.bus) return;
    const token = ++this.fileToken;
    const [file] = st.tracks[this.fileI % st.tracks.length];
    const buf = await load(this.ctx, `music/${file}`);
    if (token !== this.fileToken || !this.bus) return;
    if (!buf) {
      this.fileI++;
      return void setTimeout(() => token === this.fileToken && void this.playFile(false), 500);
    }
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const env = ctx.createGain();
    env.gain.value = 0;
    src.connect(env).connect(this.bus);
    const t = ctx.currentTime + 0.03;
    // (tuning in: from somewhere in the piece, as if it had been playing)
    const off = first ? Math.random() * buf.duration * 0.6 : 0;
    src.start(t, off);
    env.gain.linearRampToValueAtTime(1.2, t + 0.6);
    const left = buf.duration - off;
    env.gain.setValueAtTime(1.2, t + Math.max(0.7, left - 1.2));
    env.gain.linearRampToValueAtTime(0, t + left);
    this.file = { src, env };
    src.onended = () => {
      if (token !== this.fileToken) return;
      env.disconnect();
      this.fileI++;
      void this.playFile(false);
      if (this.inCar) this.show();
    };
  }
}
