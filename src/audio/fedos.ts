/**
 * The FedosArt Planetarium's music, synthesised: a slow, dark hymn under a turning sky (his worlds:
 * cosmic, a little medieval, a little cyberpunk). A sub drone on D; a choir breathing the chords,
 * D minor, B♭, G minor and A (the harmonic minor's dark cadence), nine seconds each; under every
 * other chord a brass swell opening and closing like an old analogue synth; a soft pulse of plucked
 * notes echoing in the dome on alternate rounds; bells twinkling high in D minor pentatonic like his
 * four-pointed sparks; a far church bell tolling now and then; and the wind of space.
 */
import { bed, bell, burst, midi, type Room, type Scene, tone } from "./lib";

/** The dome: long and dark. */
export const DOME: Room = { len: 6, decay: 1.6, tone: 0.32, wet: 0.75 };

const CHORD = 9;
/** Choir voicings (midi) and the brass's root, by round: two rounds, then again. */
const ROUNDS: { choir: number[]; root: number }[][] = [
  [
    { choir: [50, 57, 62, 65], root: 38 },
    { choir: [46, 53, 58, 62], root: 34 },
    { choir: [43, 50, 55, 58], root: 31 },
    { choir: [45, 52, 57, 61], root: 33 },
  ],
  [
    { choir: [50, 57, 62, 65], root: 38 },
    { choir: [43, 50, 58, 62], root: 31 },
    { choir: [46, 53, 58, 65], root: 34 },
    { choir: [45, 52, 61, 64], root: 33 },
  ],
];
/** Formants: "ah", "oh", "oo". */
const VOWELS: [number, number][] = [
  [730, 1090],
  [570, 840],
  [300, 870],
];
const STARS = [62, 65, 67, 69, 72, 74, 77, 79, 81, 84, 86];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/** One choir voice on a note: three detuned saws through two formants, a slow swell in and out. */
function choir(s: Scene, t: number, n: number, dur: number, vol: number, vw: [number, number], pan: number) {
  const ctx = s.ctx;
  const f = midi(n);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + dur * 0.38);
  g.gain.setValueAtTime(vol, t + dur * 0.62);
  g.gain.linearRampToValueAtTime(0, t + dur);
  const f1 = ctx.createBiquadFilter();
  f1.type = "bandpass";
  f1.frequency.value = vw[0];
  f1.Q.value = 5;
  const f2 = ctx.createBiquadFilter();
  f2.type = "bandpass";
  f2.frequency.value = vw[1];
  f2.Q.value = 7;
  const body = ctx.createBiquadFilter();
  body.type = "lowpass";
  body.frequency.value = 900;
  f1.connect(g);
  f2.connect(g);
  body.connect(g);
  // a slow vibrato, the same for the three (one singer section, not a chorus effect)
  const vib = ctx.createOscillator();
  vib.frequency.value = rnd(4.6, 5.4);
  const vd = ctx.createGain();
  vd.gain.setValueAtTime(0, t);
  vd.gain.linearRampToValueAtTime(f * 0.006, t + dur * 0.5);
  vib.connect(vd);
  const oscs = [vib];
  for (const det of [-7, 0, 7]) {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = f;
    o.detune.value = det + rnd(-2, 2);
    vd.connect(o.frequency);
    o.connect(f1);
    o.connect(f2);
    o.connect(body);
    oscs.push(o);
  }
  s.send(g, 0.8, pan);
  for (const o of oscs) {
    o.start(t);
    o.stop(t + dur + 0.1);
  }
}

/** The brass swell: two detuned saws an octave apart on the root, a filter opening then closing. */
function swell(s: Scene, t: number, n: number, dur: number, vol: number) {
  const ctx = s.ctx;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.Q.value = 2.5;
  lp.frequency.setValueAtTime(180, t);
  lp.frequency.linearRampToValueAtTime(1500, t + dur * 0.45);
  lp.frequency.linearRampToValueAtTime(220, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + dur * 0.4);
  g.gain.linearRampToValueAtTime(0, t + dur);
  for (const [m, det] of [
    [1, -9],
    [1, 9],
    [2, -5],
    [2, 6],
  ]) {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = midi(n) * m;
    o.detune.value = det;
    o.connect(lp);
    o.start(t);
    o.stop(t + dur + 0.1);
  }
  lp.connect(g);
  s.send(g, 0.6);
}

/** A plucked note and its echoes round the dome, left and right. */
function pluck(s: Scene, t: number, n: number, vol: number) {
  for (let r = 0; r < 4; r++)
    tone(s, t + r * 0.375, midi(n), "sawtooth", vol * 0.55 ** r, 0.35, 0.5, {
      lp: 1100 - r * 180,
      pan: r % 2 ? 0.55 : -0.55,
    });
}

/** A far church bell: the strike, its hum an octave down, the minor third that makes it a bell. */
function toll(s: Scene, t: number, n: number, vol: number) {
  const f = midi(n);
  bell(s, t, f, 7, vol, 0.85);
  tone(s, t, f / 2, "sine", vol * 0.6, 8, 0.85, { a: 0.02 });
  tone(s, t, f * 1.2, "sine", vol * 0.35, 5, 0.85);
}

/** The music into the planetarium's scene. */
export function planetariumMusic(s: Scene) {
  const ctx = s.ctx;
  // ---- the drone: D under everything, breathing
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 200;
  const dg = ctx.createGain();
  dg.gain.value = 0.09;
  for (const [f, v, type] of [
    [36.71, 1, "sine"],
    [73.42, 0.45, "triangle"],
    [110, 0.18, "sawtooth"],
  ] as [number, number, OscillatorType][]) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = rnd(-4, 4);
    const og = ctx.createGain();
    og.gain.value = v;
    o.connect(og).connect(lp);
    o.start();
    s.keep(o);
  }
  const l = ctx.createOscillator();
  l.frequency.value = 0.06;
  const ld = ctx.createGain();
  ld.gain.value = 0.025;
  l.connect(ld).connect(dg.gain);
  l.start();
  s.keep(l);
  lp.connect(dg);
  s.send(dg, 0.4);
  s.layers.push("drone");

  // ---- the wind of space
  bed(s, "space-wind", {
    kind: "pink",
    type: "bandpass",
    f: 420,
    q: 1.2,
    gain: 0.03,
    wet: 0.6,
    fm: [0.05, 260],
    am: [[0.04, 0.5]],
  });

  // ---- the hymn: chords, swells, the pulse
  s.layers.push("choir", "brass", "pulse");
  let next = s.now + 0.4,
    i = 0;
  s.seq((until) => {
    while (next < until) {
      const round = Math.floor(i / 4) % ROUNDS.length;
      const c = ROUNDS[round][i % 4];
      const vw = VOWELS[Math.floor(i / 2) % VOWELS.length];
      c.choir.forEach((n, k) => choir(s, next + k * 0.12, n, CHORD + 2.2, k === 0 ? 0.07 : 0.054, vw, (k - 1.5) * 0.35));
      if (i % 2 === 0) swell(s, next + 0.6, c.root, CHORD + 1, 0.028);
      // the pulse on the second round of every three: the chord's notes, up an octave, in eighths
      if (Math.floor(i / 4) % 3 === 1) {
        const notes = c.choir.slice(1).map((n) => n + 12);
        for (let b = 0; b < 12; b++) pluck(s, next + 1.5 + b * 0.75, notes[b % notes.length], 0.014);
      }
      next += CHORD;
      i++;
    }
  });

  // ---- the stars: bells high up, now one, now a little run
  s.layers.push("star-bells");
  s.every("star", 1.6, 4.4, (t) => {
    const n = pick(STARS);
    const run = Math.random() < 0.3 ? 3 : 1;
    for (let r = 0; r < run; r++) bell(s, t + r * 0.17, midi(STARS[Math.min(STARS.length - 1, STARS.indexOf(n) + r)]), 3.2, 0.024 * (1 - r * 0.2), 0.8, rnd(-0.8, 0.8));
  });

  // ---- the far bell
  s.layers.push("toll");
  s.every(
    "toll",
    45,
    80,
    (t) => {
      for (let r = 0; r < 3; r++) toll(s, t + r * 3.4, 38, 0.05);
    },
    20,
  );

  // ---- what happens in the room (planetarium.ts sends them) ----
  // through the portal: a rush of air rising, a sub drop, the full chord swelling, the bell
  s.on.warp = (t) => {
    rush(s, t, 2.6, 0.22);
    tone(s, t, 70, "sine", 0.22, 2.4, 0.3, { to: 28, a: 0.05 });
    for (const [k, n] of [50, 57, 62, 65, 69].entries()) choir(s, t + 0.3 + k * 0.08, n, 6.5, 0.07, VOWELS[0], (k - 2) * 0.4);
    swell(s, t + 0.2, 38, 6, 0.06);
    for (let r = 0; r < 6; r++) bell(s, t + 0.9 + r * 0.12, midi(STARS[3 + r]), 3, 0.035, 0.85, r % 2 ? 0.6 : -0.6);
    toll(s, t + 2.2, 38, 0.07);
  };
  // a work blooms in the sky: a shimmer rising, a breath of choir
  s.on.show = (t) => {
    for (let r = 0; r < 5; r++) bell(s, t + r * 0.16, midi(STARS[2 + r * 2] ?? 84), 3.4, 0.03, 0.85, (r - 2) * 0.35);
    rush(s, t, 3.2, 0.05);
    choir(s, t + 0.2, 69, 5, 0.05, VOWELS[2], 0);
  };
  // a work wakes as you come up to it: a soft chime
  s.on.wake = (t) => {
    bell(s, t, midi(pick([74, 77, 81])), 2.6, 0.035, 0.8, rnd(-0.4, 0.4));
    bell(s, t + 0.14, midi(pick([86, 88, 89])), 2.2, 0.02, 0.8, rnd(-0.4, 0.4));
  };
}

/** Air rushing past, rising in pitch (a band of noise swept up, then gone). */
function rush(s: Scene, t: number, dur: number, vol: number) {
  const f = burst(s, t, "pink", "bandpass", 180, 1.4, vol, dur, 0.5, 0, dur * 0.55);
  f.frequency.setValueAtTime(180, t);
  f.frequency.exponentialRampToValueAtTime(3200, t + dur * 0.8);
}
