/**
 * A BLANK CANVAS (the Louvre's floor 7), synthesised after the teaser it comes from: a heavy sub
 * drone that breathes, dark chords far off in the concrete (A minor, F, D minor, E: ten seconds
 * each, filtered saws), two high sines beating like a projector's hum, and the warehouse settling
 * now and then (a beam ticks, a far door). The room's events (./interior/museum/blankcanvas.ts):
 * a work thrown onto the walls lands on an impact (a rising breath, a sub drop, a struck plate);
 * back to the blank canvas, a downward sweep and a white ring; every typed letter, a key.
 */
import { bell, burst, clank, drone, midi, type Room, type Scene, tone } from "./lib";

/** A long hall of bare concrete: a slow, dark tail, a slap off the far wall. */
export const WAREHOUSE: Room = { len: 4.6, decay: 1.7, tone: 0.3, wet: 0.7, slap: 0.17 };

const CHORD = 10;
/** The chords' voicings (midi), and their roots for the sub. */
const CHORDS: { notes: number[]; root: number }[] = [
  { notes: [57, 60, 64, 71], root: 33 },
  { notes: [53, 57, 60, 64], root: 29 },
  { notes: [50, 53, 57, 64], root: 26 },
  { notes: [52, 56, 59, 62], root: 28 },
];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** A dark pad voice: two detuned saws through a low-pass that opens a little and closes, a slow swell. */
function pad(s: Scene, t: number, n: number, dur: number, vol: number, pan: number) {
  const ctx = s.ctx;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.Q.value = 1.2;
  lp.frequency.setValueAtTime(320, t);
  lp.frequency.linearRampToValueAtTime(1100, t + dur * 0.5);
  lp.frequency.linearRampToValueAtTime(380, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + dur * 0.4);
  g.gain.setValueAtTime(vol, t + dur * 0.6);
  g.gain.linearRampToValueAtTime(0, t + dur);
  for (const det of [-8, 7]) {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = midi(n);
    o.detune.value = det + rnd(-2, 2);
    o.connect(lp);
    o.start(t);
    o.stop(t + dur + 0.1);
  }
  lp.connect(g);
  s.send(g, 0.85, pan);
}

/** The music into the floor's scene. */
export function blankCanvasMusic(s: Scene) {
  // ---- the sub: A, breathing, its fifth faint over it
  drone(
    s,
    "sub",
    [
      [27.5, 1],
      [55, 0.55],
      [82.4, 0.12],
    ],
    "sine",
    160,
    0.11,
    0.25,
    [0.07, 0.35],
  );
  // ---- the projector's hum: two high sines a hair apart, beating
  drone(
    s,
    "hum",
    [
      [1318.5, 0.5],
      [1320.1, 0.5],
      [659.3, 0.3],
    ],
    "sine",
    4000,
    0.0045,
    0.6,
    [0.05, 0.6],
  );

  // ---- the chords, far off
  s.layers.push("pads");
  let next = s.now + 0.6,
    i = 0;
  s.seq((until) => {
    while (next < until) {
      const c = CHORDS[i % CHORDS.length];
      c.notes.forEach((n, k) => pad(s, next + k * 0.2, n, CHORD + 2.5, k === 0 ? 0.026 : 0.02, (k - 1.5) * 0.4));
      // the sub moves with the chord: a long low note under the drone
      tone(s, next, midi(c.root), "sine", 0.06, CHORD, 0.2, { a: 3, hold: CHORD - 5, lp: 120 });
      next += CHORD;
      i++;
    }
  });

  // ---- the warehouse settling: a beam ticks as it cools, a far door, a chain
  s.layers.push("settle");
  s.every("beam", 14, 32, (t) => clank(s, t, rnd(180, 260), 0.012, 1.6, 0.85, rnd(-0.8, 0.8)));
  s.every("door", 40, 75, (t) => {
    burst(s, t, "brown", "lowpass", 140, 0.7, 0.09, 1.2, 0.8, rnd(-0.6, 0.6), 0.02);
    clank(s, t + 0.05, 95, 0.02, 2.2, 0.9);
  });

  // ---- what happens in the room (blankcanvas.ts sends them) ----
  // a work lands on the walls: a breath rising into it, a sub drop, a struck plate, a high shimmer
  s.on["canvas-hit"] = (t) => {
    const sw = burst(s, t, "pink", "bandpass", 300, 1.2, 0.07, 0.55, 0.5, 0, 0.5);
    sw.frequency.setValueAtTime(300, t);
    sw.frequency.exponentialRampToValueAtTime(2600, t + 0.5);
    const at = t + 0.5;
    tone(s, at, 82, "sine", 0.32, 2.6, 0.35, { to: 30, a: 0.004 });
    burst(s, at, "brown", "lowpass", 220, 0.8, 0.22, 0.9, 0.6);
    clank(s, at, 72, 0.05, 4, 0.9);
    for (let r = 0; r < 4; r++) bell(s, at + 0.25 + r * 0.11, midi([81, 84, 88, 91][r]), 3, 0.016, 0.9, r % 2 ? 0.6 : -0.6);
  };
  // back to the blank canvas: the colour drains down, a white ring stays
  s.on["canvas-blank"] = (t) => {
    const sw = burst(s, t, "pink", "bandpass", 2400, 1.4, 0.05, 1.4, 0.6, 0, 0.05);
    sw.frequency.setValueAtTime(2400, t);
    sw.frequency.exponentialRampToValueAtTime(160, t + 1.3);
    tone(s, t + 0.2, 55, "sine", 0.14, 2.2, 0.4, { a: 0.08 });
    tone(s, t + 0.3, 1760, "sine", 0.018, 4.5, 0.8, { a: 0.4 });
    tone(s, t + 0.3, 2637, "sine", 0.008, 4, 0.8, { a: 0.6 });
  };
  // a key struck, close and dry
  s.on["canvas-type"] = (t) => {
    burst(s, t, "white", "bandpass", rnd(2600, 3400), 1.8, 0.05, 0.025, 0.12);
    burst(s, t + 0.004, "pink", "lowpass", 420, 0.8, 0.03, 0.03, 0.1);
  };
  // a small monolith wakes as you come up to it
  s.on["canvas-wake"] = (t) => {
    tone(s, t, midi(rnd(0, 1) < 0.5 ? 76 : 79), "sine", 0.02, 1.8, 0.7, { a: 0.02 });
    tone(s, t + 0.05, 110, "sine", 0.05, 0.6, 0.3, { to: 70 });
  };
}
