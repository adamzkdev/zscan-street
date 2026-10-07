/**
 * The pyramid's music, synthesised: an ancient, dark bed in the Hijaz mode on D (D E♭ F♯ G A B♭ C)
 * — a low drone, a breathy ney that plays a phrase now and then, an oud picking a few notes, a frame
 * drum far off, drips and stone settling — and a second, tense track for when a mummy has seen you:
 * a darbuka beating the maqsum, a low ostinato grinding on the minor second, brass stabs and a
 * wailing mizmar. The two are cross-faded by `sound.event("chase", on)`; the mummies' own sounds
 * (a moan, a shuffle, the sting when one spots you, the curse when one catches you) are events too.
 */
import { burst, drip, drum, envGain, midi, type Room, Scene, tone, vowel } from "./lib";

const ROOM: Room = { len: 4, decay: 2, tone: 0.3, wet: 0.6 };
/** Hijaz on D, over two octaves (midi). */
const HIJAZ = [50, 51, 54, 55, 57, 58, 60, 62, 63, 66, 67, 69, 70, 72, 74];
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** A ney note: a breathy flute that slides in from below and sways (vibrato) once it holds. */
function ney(s: Scene, t: number, n: number, dur: number, vol: number, wet: number, pan = 0) {
  const ctx = s.ctx;
  const f = midi(n);
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(f * 0.955, t);
  o.frequency.exponentialRampToValueAtTime(f, t + 0.14);
  const o2 = ctx.createOscillator();
  o2.type = "triangle";
  o2.frequency.setValueAtTime(f * 2 * 0.955, t);
  o2.frequency.exponentialRampToValueAtTime(f * 2, t + 0.14);
  // vibrato that grows in after the attack
  const vib = ctx.createOscillator();
  vib.frequency.value = 5.2 + Math.random();
  const vd = ctx.createGain();
  vd.gain.setValueAtTime(0, t);
  vd.gain.linearRampToValueAtTime(f * 0.009, t + Math.min(0.6, dur * 0.6));
  vib.connect(vd);
  vd.connect(o.frequency);
  const vd2 = ctx.createGain();
  vd2.gain.value = 2;
  vd.connect(vd2).connect(o2.frequency);
  const a = Math.min(0.22, dur * 0.3);
  const g = envGain(s, t, vol, a, Math.max(0, dur - a - 0.1), 0.5);
  const g2 = ctx.createGain();
  g2.gain.value = 0.18;
  o.connect(g);
  o2.connect(g2).connect(g);
  s.send(g, wet, pan);
  const end = t + dur + 0.7;
  for (const x of [o, o2, vib]) {
    x.start(t);
    x.stop(end);
  }
  // the breath through the reed
  burst(s, t, "pink", "bandpass", f * 2.2, 2.2, vol * 0.5, dur + 0.25, wet, pan, Math.min(0.25, dur * 0.4));
}

/** An oud string plucked: a bright attack that dulls quickly, a little pitch drop, a nail click. */
function oud(s: Scene, t: number, n: number, vol: number, wet: number, pan = 0) {
  const f = midi(n);
  tone(s, t, f, "sawtooth", vol * 0.55, 0.18, wet, { lp: 2400, pan, to: f * 0.995 });
  tone(s, t, f, "triangle", vol, 1.1, wet, { lp: 1500, pan });
  tone(s, t, f * 2, "sine", vol * 0.2, 0.5, wet, { pan });
  burst(s, t, "white", "bandpass", 3500, 2, vol * 0.25, 0.02, wet, pan, 0.001);
}

/** A darbuka: the deep "doum" in the middle, the dry "tek" on the rim, the soft "ka". */
function doum(s: Scene, t: number, vol: number) {
  tone(s, t, 150, "sine", vol, 0.32, 0.15, { to: 70 });
  burst(s, t, "pink", "lowpass", 700, 0.7, vol * 0.35, 0.07, 0.15);
}
function tek(s: Scene, t: number, vol: number, pan = 0.15) {
  burst(s, t, "white", "bandpass", 3400, 1.4, vol, 0.045, 0.2, pan, 0.001);
  tone(s, t, 880, "sine", vol * 0.35, 0.04, 0.1, { pan });
}

/** A brass cluster (a stab, the sting): two detuned saws per note through a filter that opens. */
function stab(s: Scene, t: number, notes: number[], dur: number, vol: number, wet: number, bright = 1800) {
  const ctx = s.ctx;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(250, t);
  lp.frequency.linearRampToValueAtTime(bright, t + 0.05);
  lp.frequency.setTargetAtTime(bright * 0.4, t + 0.1, 0.25);
  const g = envGain(s, t, vol, 0.02, dur, 0.35);
  for (const n of notes)
    for (const det of [-9, 9]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = midi(n);
      o.detune.value = det;
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.5);
    }
  lp.connect(g);
  s.send(g, wet);
}

/** A sub-scene with its own fader and room, ticked by the parent and closed with it. */
function part(s: Scene, id: string, level: number) {
  const k = new Scene(s.ctx, s.bufs, s.dry, id, ROOM);
  k.out.gain.value = level;
  s.seq(() => k.tick());
  s.onClose(() => k.close(0.1));
  return k;
}

function fadeTo(g: GainNode, v: number, secs: number) {
  const t = g.context.currentTime;
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(g.gain.value, t);
  g.gain.linearRampToValueAtTime(v, t + secs);
}

/**
 * The music into a pyramid scene. `deep`: the King's Chamber (no chase down there, a sparser,
 * lower bed).
 */
export function pyramidMusic(s: Scene, deep: boolean) {
  const calm = part(s, "egypt-calm", 1);

  // ---- the bed: a drone on D and A, breathing slowly, a sub under it
  const ctx = s.ctx;
  const droneLP = ctx.createBiquadFilter();
  droneLP.type = "lowpass";
  droneLP.frequency.value = deep ? 220 : 300;
  const droneG = ctx.createGain();
  droneG.gain.value = 0.05;
  for (const [f, v, type] of [
    [36.71, 0.9, "sine"],
    [73.42, 0.55, "sawtooth"],
    [110.0, 0.3, "sawtooth"],
    [146.83, 0.12, "sawtooth"],
  ] as [number, number, OscillatorType][]) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = (Math.random() - 0.5) * 6;
    const og = ctx.createGain();
    og.gain.value = v;
    o.connect(og).connect(droneLP);
    o.start();
    calm.keep(o);
  }
  // the filter and the level breathe, out of step
  const lfoF = ctx.createOscillator();
  lfoF.frequency.value = 0.05;
  const lfoFd = ctx.createGain();
  lfoFd.gain.value = 120;
  lfoF.connect(lfoFd).connect(droneLP.frequency);
  lfoF.start();
  calm.keep(lfoF);
  const lfoA = ctx.createOscillator();
  lfoA.frequency.value = 0.083;
  const lfoAd = ctx.createGain();
  lfoAd.gain.value = 0.018;
  lfoA.connect(lfoAd).connect(droneG.gain);
  lfoA.start();
  calm.keep(lfoA);
  droneLP.connect(droneG);
  calm.send(droneG, 0.35);
  calm.layers.push("drone-hijaz");
  s.layers.push("drone-hijaz");

  // ---- the ney: a phrase now and then, wandering the mode, resting on D, A or G
  let at = 57;
  s.layers.push("ney");
  calm.every(
    "ney",
    deep ? 14 : 9,
    deep ? 26 : 18,
    (t) => {
      const len = 3 + Math.floor(Math.random() * 4);
      let tt = t;
      const hi = HIJAZ.indexOf(at) >= 0 ? HIJAZ.indexOf(at) : 4;
      let i = Math.max(3, Math.min(HIJAZ.length - 2, hi));
      for (let k = 0; k < len; k++) {
        const last = k === len - 1;
        i = Math.max(3, Math.min(HIJAZ.length - 1, i + pick([-2, -1, -1, 1, 1, 2])));
        let n = HIJAZ[i];
        if (last) n = pick([57, 62, 55, 62]);
        const d = last ? rnd(2.4, 3.8) : pick([0.45, 0.6, 0.9, 1.2]);
        ney(calm, tt, n + (deep ? -12 : 0), d, 0.05, 0.55, -0.2);
        // a quick turn (an ornament) before some notes
        if (!last && Math.random() < 0.25) ney(calm, tt + d * 0.62, HIJAZ[Math.min(HIJAZ.length - 1, i + 1)] + (deep ? -12 : 0), d * 0.3, 0.035, 0.55, -0.2);
        tt += d + (last ? 0 : 0.05);
        at = n;
      }
    },
    deep ? 6 : 3,
  );

  // ---- the oud: a few low notes picked, a little rhythm
  s.layers.push("oud");
  calm.every(
    "oud",
    deep ? 16 : 11,
    deep ? 30 : 20,
    (t) => {
      const motif = pick([
        [50, 51, 50, 45, 50],
        [50, 54, 55, 54, 51, 50],
        [45, 50, 51, 54, 51, 50],
        [57, 55, 54, 51, 50],
      ]);
      const beat = rnd(0.28, 0.36);
      let tt = t;
      motif.forEach((n, k) => {
        oud(calm, tt, n, 0.07, 0.4, 0.3);
        // the oud's tremolo on a held note
        if (k === motif.length - 1) for (let r = 1; r < 6; r++) oud(calm, tt + r * 0.09, n, 0.03, 0.4, 0.3);
        tt += beat * pick([1, 1, 2, 0.5]);
      });
    },
    deep ? 10 : 7,
  );

  // ---- a frame drum, far off; drips; the stone settling
  calm.every("bendir", 7, 14, (t) => {
    drum(calm, t, 52, 0.12, 0.6, -0.3);
    if (Math.random() < 0.5) drum(calm, t + 0.55, 58, 0.07, 0.6, -0.3);
  });
  s.every("drip", 2.2, 7, (t) => drip(s, t, 0.035, 0.6));
  s.every("stone", 22, 48, (t) => {
    const f = burst(s, t, "brown", "lowpass", 240, 0.8, 0.14, 2.6, 0.5, Math.random() - 0.5, 0.4);
    f.frequency.setValueAtTime(240, t);
    f.frequency.exponentialRampToValueAtTime(70, t + 2.6);
  });
  s.layers.push("drips", "stone");

  if (deep) return;

  // ---- the chase: darbuka (maqsum), the low ostinato, brass stabs, the mizmar
  const chase = part(s, "egypt-chase", 0);
  let on = false;
  let next = 0;
  let bar = 0;
  const BEAT = 60 / 138 / 2; // an eighth
  // maqsum over eight eighths: D T . T D . T .
  const MAQSUM = ["D", "T", "", "T", "D", "", "T", ""];
  const OSTINATO = [38, 38, 39, 38, 38, 38, 42, 39];
  chase.seq((until) => {
    if (!on) {
      next = Math.max(next, until);
      return;
    }
    while (next < until) {
      const t0 = next;
      for (let i = 0; i < 8; i++) {
        const t = t0 + i * BEAT;
        if (MAQSUM[i] === "D") doum(chase, t, 0.5);
        else if (MAQSUM[i] === "T") tek(chase, t, 0.22);
        else if (Math.random() < 0.6) tek(chase, t, 0.08, -0.2);
        // a roll of ka's into the next bar
        if (i === 7 && bar % 4 === 3) for (let r = 0; r < 4; r++) tek(chase, t + (r * BEAT) / 4, 0.06 + r * 0.03, -0.1);
        const n = OSTINATO[i] + (bar % 8 >= 4 ? 5 : 0);
        tone(chase, t, midi(n), "sawtooth", 0.07, BEAT * 0.8, 0.2, { lp: 650 });
        tone(chase, t, midi(n - 12), "sine", 0.12, BEAT * 0.9, 0.1);
      }
      if (bar % 2 === 0) stab(chase, t0, bar % 8 >= 4 ? [43, 44, 50] : [38, 39, 45], BEAT * 1.6, 0.05, 0.35);
      // the mizmar wails a run up the mode every other bar
      if (bar % 2 === 1) {
        let i = 6 + Math.floor(Math.random() * 3);
        for (let k = 0; k < 6; k++) {
          const n = HIJAZ[Math.min(HIJAZ.length - 1, i)] + 12;
          tone(chase, t0 + k * BEAT, midi(n), "sawtooth", 0.022, BEAT * (k === 5 ? 3 : 0.9), 0.4, { lp: 2600, a: 0.02, detune: (Math.random() - 0.5) * 20, pan: 0.25 });
          i += pick([1, 1, 2, -1]);
        }
      }
      next += BEAT * 8;
      bar++;
    }
  });
  s.layers.push("chase");

  s.on.chase = (t, arg) => {
    const want = arg !== false;
    if (want === on) return;
    on = want;
    if (on) {
      next = t + 0.05;
      bar = 0;
      fadeTo(chase.out, 1.7, 0.25);
      fadeTo(calm.out, 0.2, 0.6);
    } else {
      fadeTo(chase.out, 0, 3);
      fadeTo(calm.out, 1, 5);
    }
  };
  // a mummy has seen you: the sting
  s.on.spotted = (t) => {
    stab(s, t, [38, 39, 45, 50, 51], 0.9, 0.09, 0.5, 2600);
    drum(s, t, 42, 0.6, 0.5);
    burst(s, t, "white", "highpass", 3000, 0.7, 0.12, 0.7, 0.6, 0, 0.25);
  };
  // caught: the curse
  s.on.caught = (t) => {
    drum(s, t, 34, 0.9, 0.6);
    stab(s, t, [26, 27, 33], 2.2, 0.12, 0.7, 900);
    vowel(s, t + 0.1, 82, 2.2, 0.12, [380, 760], 0.7, 3);
    burst(s, t, "brown", "lowpass", 300, 0.7, 0.3, 2.5, 0.6, 0, 0.05);
  };
  // the mummies themselves, panned and as loud as near: a moan, a dragged foot
  s.on["mummy-moan"] = (t, arg) => {
    const a = (arg ?? {}) as { vol?: number; pan?: number; angry?: boolean };
    const v = a.vol ?? 0.5;
    const f0 = a.angry ? rnd(120, 150) : rnd(85, 110);
    vowel(s, t, f0, a.angry ? 1.1 : 1.8, 0.09 * v, [rnd(330, 420), rnd(700, 820)], 0.6, 2, a.pan ?? 0);
    burst(s, t, "pink", "bandpass", 500, 1.2, 0.05 * v, 1.2, 0.6, a.pan ?? 0, 0.3);
  };
  s.on["mummy-step"] = (t, arg) => {
    const a = (arg ?? {}) as { vol?: number; pan?: number };
    const v = a.vol ?? 0.5;
    burst(s, t, "pink", "lowpass", 420, 0.8, 0.18 * v, 0.22, 0.4, a.pan ?? 0, 0.03);
    burst(s, t + 0.02, "white", "bandpass", 1800, 1.2, 0.05 * v, 0.18, 0.4, a.pan ?? 0, 0.06);
  };
}
