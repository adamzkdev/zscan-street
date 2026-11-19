/**
 * ZK PARTY's ambience beds, procedural: each kind (./kinds.ts) is two looping layers rendered
 * once in slices (never a long stall; loops of co-prime lengths, so the pair repeats only after
 * minutes) and a few one-shot events at random moments (gulls, horns, clanks, thunder…), random in
 * pan, level and pitch. The bed sets the mixer's room (the effects ring in the same space).
 *
 * `ambience.play(kind, fade)` cross-fades to a bed (null or `stop()` fades out), `ambience.swell(k)`
 * lifts or lowers it for a moment (a crowd at a goal), `ambience.event(name)` fires one of its
 * one-shots now (a thunder clap on a storm level). The host starts a game's bed under its card
 * and stops it at the podium; the board plays its map's.
 *
 * CPU: two looping buffer sources and an event every few seconds (3 nodes). Memory: ~3–5 MB a kind
 * (32 kHz stereo), the last three kinds kept.
 */
import type { AmbienceKind, RoomKind } from "./kinds";
import { LP1, Noise, Osc, SVF, Sig, TAU, ad, bump, chunked, pan, rand, soft, type Rand } from "./dsp";
import { mixerFor, party, type Mixer } from "./engine";
import { playSfx, type SfxName } from "./sfx";
import { master } from "./master";

const SR = 32000;
const P: [number, number] = [0, 0];

/** A layer's generator: fills frames [i0, i1) of L/R, keeping its state between calls. */
type Gen = (L: Float32Array, R: Float32Array, i0: number, i1: number) => void;
type GenMaker = (sr: number, r: Rand, len: number) => Gen;

// ---- the generators ----------------------------------------------------------------------------------

/** A slow random wobble 0..1 (a few sines of incommensurate periods). */
function wobble(r: Rand, speed = 1) {
  const f = [0.031, 0.077, 0.143, 0.21].map((x) => x * speed * (0.8 + r() * 0.4));
  const ph = f.map(() => r() * TAU);
  return (t: number) => 0.5 + (Math.sin(TAU * f[0] * t + ph[0]) * 0.4 + Math.sin(TAU * f[1] * t + ph[1]) * 0.3 + Math.sin(TAU * f[2] * t + ph[2]) * 0.2 + Math.sin(TAU * f[3] * t + ph[3]) * 0.1) * 0.5;
}

/** Wind: pink noise through a band that wanders; gusts in its level; an optional whistling howl. */
const wind =
  (o: { lo: number; hi: number; q: number; level: number; gusty: number; howl?: number; speed?: number }): GenMaker =>
  (sr, r) => {
    const n = [new Noise(rand(r() * 1e9)), new Noise(rand(r() * 1e9))];
    const bp = [new SVF(sr, o.lo, o.q), new SVF(sr, o.lo, o.q)];
    const hw = [new SVF(sr, 700, 10), new SVF(sr, 700, 10)];
    const body = [new LP1(sr, 300), new LP1(sr, 300)];
    const m = [wobble(r, o.speed ?? 1), wobble(r, o.speed ?? 1)];
    const g = wobble(r, (o.speed ?? 1) * 1.7);
    return (L, R, i0, i1) => {
      for (let c = 0; c < 2; c++) {
        const out = c ? R : L;
        let e = 0;
        for (let i = i0; i < i1; i++) {
          if ((i & 31) === 0) {
            const t = i / sr;
            const w = m[c](t);
            bp[c].set(o.lo + (o.hi - o.lo) * w, o.q);
            hw[c].set(500 + 600 * w, 10);
            e = 1 - o.gusty + o.gusty * Math.pow(g(t + c * 0.4), 1.5) * 1.6;
          }
          const p = n[c].pink();
          bp[c].tick(p);
          let x = bp[c].bpn() * 0.9 + body[c].tick(n[c].white()) * 0.8;
          if (o.howl) {
            hw[c].tick(p);
            x += hw[c].bpn() * o.howl;
          }
          out[i] += x * e * o.level;
        }
      }
    };
  };

/** A low rumble: brown noise under a low-pass, slowly breathing. */
const rumble =
  (o: { fc: number; level: number; am?: number; mid?: number }): GenMaker =>
  (sr, r) => {
    const n = [new Noise(rand(r() * 1e9)), new Noise(rand(r() * 1e9))];
    const lp = [new SVF(sr, o.fc, 0.6), new SVF(sr, o.fc, 0.6)];
    const md = [new SVF(sr, o.fc * 3, 0.8), new SVF(sr, o.fc * 3, 0.8)];
    const w = wobble(r, 2);
    return (L, R, i0, i1) => {
      for (let c = 0; c < 2; c++) {
        const out = c ? R : L;
        let e = 1;
        for (let i = i0; i < i1; i++) {
          if ((i & 63) === 0) e = 1 - (o.am ?? 0) + (o.am ?? 0) * w(i / sr + c);
          const b = n[c].brown();
          lp[c].tick(b);
          md[c].tick(n[c].pink());
          out[i] += (lp[c].lp * 1.4 + md[c].bpn() * (o.mid ?? 0)) * e * o.level;
        }
      }
    };
  };

/** A steady hiss (rain's sheen, a vent, blowing snow): white noise high-passed, gently moving. */
const hiss =
  (o: { fc: number; level: number; top?: number; am?: number }): GenMaker =>
  (sr, r) => {
    const n = [new Noise(rand(r() * 1e9)), new Noise(rand(r() * 1e9))];
    const hp = [new SVF(sr, o.fc, 0.7), new SVF(sr, o.fc, 0.7)];
    const lp = [new LP1(sr, o.top ?? 9000), new LP1(sr, o.top ?? 9000)];
    const w = wobble(r, 3);
    return (L, R, i0, i1) => {
      for (let c = 0; c < 2; c++) {
        const out = c ? R : L;
        let e = 1;
        for (let i = i0; i < i1; i++) {
          if ((i & 63) === 0) e = 1 - (o.am ?? 0.3) + (o.am ?? 0.3) * w(i / sr + c * 3);
          hp[c].tick(n[c].white());
          out[i] += lp[c].tick(hp[c].hp) * e * o.level;
        }
      }
    };
  };

/** Rain: droplets ticking on roofs and puddles (two colours), over a soft sheen. */
const rain =
  (o: { density: number; level: number; heavy?: number }): GenMaker =>
  (sr, r) => {
    const n = [new Noise(rand(r() * 1e9)), new Noise(rand(r() * 1e9))];
    const b1 = [new SVF(sr, 2600, 1.6), new SVF(sr, 2600, 1.6)];
    const b2 = [new SVF(sr, 6200, 2.2), new SVF(sr, 6200, 2.2)];
    const bed = [new SVF(sr, 1400, 0.6), new SVF(sr, 1400, 0.6)];
    const roof = [new LP1(sr, 420), new LP1(sr, 420)];
    const p = o.density / sr;
    const heavy = o.heavy ?? 0.25;
    return (L, R, i0, i1) => {
      for (let c = 0; c < 2; c++) {
        const out = c ? R : L;
        const rr = n[c].r;
        for (let i = i0; i < i1; i++) {
          let d1 = 0;
          let d2 = 0;
          if (rr() < p) {
            const a = rr() * rr();
            if (rr() < 0.55) d1 = a;
            else d2 = a;
          }
          b1[c].tick(d1 * 14);
          b2[c].tick(d2 * 12);
          const pk = n[c].pink();
          bed[c].tick(pk);
          out[i] += (b1[c].bp + b2[c].bp + bed[c].hp * 0.22 + roof[c].tick(pk) * heavy * 1.5) * o.level;
        }
      }
    };
  };

/** Waves: swells that rise, break and wash back, one side then the other; a far surf under. */
const waves =
  (o: { level: number; every: [number, number] }): GenMaker =>
  (sr, r, len) => {
    const evs: [number, number, number][][] = [[], []];
    for (let c = 0; c < 2; c++) {
      let t = -2 + c * (o.every[0] * 0.45);
      while (t < len + 4) {
        evs[c].push([t, 0.6 + r() * 0.5, 1.8 + r() * 1.4]);
        t += o.every[0] + r() * (o.every[1] - o.every[0]);
      }
    }
    const shape = (u: number, rise: number) => (u < 0 ? 0 : u < rise ? Math.pow(u / rise, 2.2) : Math.exp(-(u - rise) / 1.5));
    const n = [new Noise(rand(r() * 1e9)), new Noise(rand(r() * 1e9))];
    const lp = [new SVF(sr, 400, 0.7), new SVF(sr, 400, 0.7)];
    const foam = [new SVF(sr, 2500, 0.7), new SVF(sr, 2500, 0.7)];
    const surf = [new LP1(sr, 350), new LP1(sr, 350)];
    return (L, R, i0, i1) => {
      for (let c = 0; c < 2; c++) {
        const out = c ? R : L;
        let e = 0;
        for (let i = i0; i < i1; i++) {
          if ((i & 31) === 0) {
            const t = i / sr;
            e = 0;
            for (const [a, g, rise] of evs[c]) if (t > a && t < a + rise + 9) e += shape(t - a, rise) * g;
            lp[c].set(250 + 2600 * Math.min(1.2, e), 0.7);
          }
          const pk = n[c].pink();
          lp[c].tick(pk);
          foam[c].tick(n[c].white());
          out[i] += (lp[c].lp * (0.25 + e) + foam[c].hp * e * e * 0.18 + surf[c].tick(pk) * 0.5) * o.level;
        }
      }
    };
  };

/** A crowd talking: voiced syllables through moving formants, and the mass of a crowd under them. */
const babble =
  (o: { streams: number; level: number; bright: number; mass: number; pitch?: number }): GenMaker =>
  (sr, r) => {
    const V: [number, number][] = [
      [730, 1090],
      [270, 2290],
      [530, 1840],
      [570, 840],
      [300, 870],
      [660, 1720],
      [490, 1350],
      [400, 2000],
    ];
    const st = Array.from({ length: o.streams }, (_, k) => {
      pan((k / Math.max(1, o.streams - 1)) * 1.6 - 0.8, P);
      return { osc: new Osc(sr, r()), f0: (95 + r() * 150) * (o.pitch ?? 1), f1: new SVF(sr, 500, 6), f2: new SVF(sr, 1500, 8), next: r() * 0.3, a: 0, at: 0, v1: 500, v2: 1500, t1: 500, t2: 1500, pl: P[0], pr: P[1], into: r() * TAU, g: 0.6 + r() * 0.4 };
    });
    const n = new Noise(rand(r() * 1e9));
    const mass = [new SVF(sr, 800, 0.9), new SVF(sr, 800, 0.9)];
    const nm = [new Noise(rand(r() * 1e9)), new Noise(rand(r() * 1e9))];
    const dist = [new LP1(sr, 1800 + 2500 * o.bright), new LP1(sr, 1800 + 2500 * o.bright)];
    const w = wobble(r, 2);
    return (L, R, i0, i1) => {
      for (let i = i0; i < i1; i++) {
        const t = i / sr;
        let l = 0;
        let rr = 0;
        const upd = (i & 31) === 0;
        for (const s of st) {
          if (t >= s.next) {
            // a new syllable (or a breath)
            const pause = r() < 0.18;
            s.next = t + (pause ? 0.15 + r() * 0.5 : 0.07 + r() * 0.17);
            s.at = pause ? 0 : (0.4 + r() * 0.6) * s.g;
            const v = V[Math.floor(r() * V.length)];
            s.t1 = v[0] * (0.9 + r() * 0.2);
            s.t2 = v[1] * (0.9 + r() * 0.2);
          }
          if (upd) {
            s.a += (s.at - s.a) * 0.35;
            s.v1 += (s.t1 - s.v1) * 0.3;
            s.v2 += (s.t2 - s.v2) * 0.3;
            s.f1.set(s.v1, 6);
            s.f2.set(s.v2, 8);
          }
          const f = s.f0 * (1 + 0.08 * Math.sin(TAU * 0.7 * t + s.into));
          const src = s.osc.saw(f) * 0.6 + n.white() * 0.4;
          s.f1.tick(src);
          s.f2.tick(src);
          const x = (s.f1.bpn() + s.f2.bpn() * 0.6) * s.a;
          l += x * s.pl;
          rr += x * s.pr;
        }
        const e = 0.7 + 0.3 * w(t);
        mass[0].tick(nm[0].pink());
        mass[1].tick(nm[1].pink());
        L[i] += (dist[0].tick(l) * 0.5 + mass[0].bpn() * o.mass * e) * o.level;
        R[i] += (dist[1].tick(rr) * 0.5 + mass[1].bpn() * o.mass * e) * o.level;
      }
    };
  };

/** Crickets: a few, each chirping its own pulses at its own rate. */
const crickets =
  (o: { n: number; level: number }): GenMaker =>
  (sr, r) => {
    const cs = Array.from({ length: o.n }, () => {
      pan(r() * 1.6 - 0.8, P);
      return { osc: new Osc(sr), f: 4100 + r() * 1000, per: 0.5 + r() * 0.45, ph: r(), pulses: 3 + Math.floor(r() * 2), a: 0.4 + r() * 0.6, pl: P[0], pr: P[1] };
    });
    return (L, R, i0, i1) => {
      for (let i = i0; i < i1; i++) {
        const t = i / sr;
        for (const c of cs) {
          const u = (t / c.per + c.ph) % 1;
          const pt = u * c.per;
          const k = Math.floor(pt / 0.034);
          let e = 0;
          if (k < c.pulses) {
            const q = pt - k * 0.034;
            e = q < 0.02 ? Math.sin((q / 0.02) * Math.PI) : 0;
          }
          const x = c.osc.sine(c.f) * e * c.a * o.level;
          L[i] += x * c.pl;
          R[i] += x * c.pr;
        }
      }
    };
  };

/** A drone of beating sines (a station's hum, a furnace's mains), and air under it. */
const hum =
  (o: { f: [number, number][]; level: number; air: number; airFc: number }): GenMaker =>
  (sr, r) => {
    const os = o.f.map(() => [new Osc(sr, r()), new Osc(sr, r())]);
    const n = [new Noise(rand(r() * 1e9)), new Noise(rand(r() * 1e9))];
    const lp = [new SVF(sr, o.airFc, 0.6), new SVF(sr, o.airFc, 0.6)];
    const w = wobble(r, 4);
    return (L, R, i0, i1) => {
      for (let i = i0; i < i1; i++) {
        const t = i / sr;
        let l = 0;
        let rr = 0;
        for (let k = 0; k < o.f.length; k++) {
          const [f, a] = o.f[k];
          l += os[k][0].sine(f) * a;
          rr += os[k][1].sine(f * 1.003) * a;
        }
        const e = 0.75 + 0.25 * w(t);
        lp[0].tick(n[0].pink());
        lp[1].tick(n[1].pink());
        L[i] += (l * e + lp[0].lp * o.air) * o.level;
        R[i] += (rr * e + lp[1].lp * o.air) * o.level;
      }
    };
  };

/** Traffic: a far city's low roar, and cars passing one way or the other. */
const traffic =
  (o: { level: number; cars: number }): GenMaker =>
  (sr, r, len) => {
    const cars: [number, number, number, number][] = [];
    for (let k = 0; k < o.cars; k++) cars.push([r() * (len + 3) - 3, 2.5 + r() * 3, 0.4 + r() * 0.8, r() < 0.5 ? -1 : 1]);
    const n = [new Noise(rand(r() * 1e9)), new Noise(rand(r() * 1e9))];
    const lo = [new SVF(sr, 220, 0.6), new SVF(sr, 220, 0.6)];
    const car = [new SVF(sr, 500, 0.8), new SVF(sr, 500, 0.8)];
    const tyre = [new SVF(sr, 1800, 0.7), new SVF(sr, 1800, 0.7)];
    const env = [0, 0];
    return (L, R, i0, i1) => {
      for (let i = i0; i < i1; i++) {
        if ((i & 31) === 0) {
          const t = i / sr;
          env[0] = env[1] = 0;
          for (const [a, d, g, dir] of cars) {
            const e = bump(t, a, a + d) * g;
            if (!e) continue;
            const x = (((t - a) / d) * 2 - 1) * dir;
            pan(x, P);
            env[0] += e * P[0];
            env[1] += e * P[1];
          }
        }
        for (let c = 0; c < 2; c++) {
          const b = n[c].brown();
          const wv = n[c].white();
          lo[c].tick(b);
          car[c].tick(b + wv * 0.1);
          tyre[c].tick(wv);
          (c ? R : L)[i] += (lo[c].lp * 1.2 + (car[c].bpn() * 0.9 + tyre[c].hp * 0.08) * env[c]) * o.level;
        }
      }
    };
  };

/** A thump every `per` seconds (a press, a rail joint: "ta-dum"), with a clack and its rattle. */
const pulse =
  (o: { per: number; hits: [number, number][]; f: number; click: number; level: number; rattle: number }): GenMaker =>
  (sr, r) => {
    const n = new Noise(rand(r() * 1e9));
    const os = new Osc(sr);
    const cl = new SVF(sr, o.click, 3);
    const rat = [new SVF(sr, 1300, 1.2), new SVF(sr, 1300, 1.2)];
    const nr = [new Noise(rand(r() * 1e9)), new Noise(rand(r() * 1e9))];
    return (L, R, i0, i1) => {
      for (let i = i0; i < i1; i++) {
        const t = i / sr;
        const u = t % o.per;
        let e = 0;
        let fq = o.f;
        for (const [at, g] of o.hits) {
          const q = u - at;
          if (q >= 0 && q < 0.4) {
            e += ad(q, 0.002, 0.06) * g;
            fq = o.f * (1 + 0.6 * Math.exp(-q / 0.015));
          }
        }
        cl.tick(e > 0.3 ? n.white() * e : 0);
        const x = os.sine(fq) * e * 0.8 + cl.bpn() * 0.5;
        const ra = 0.6 + 0.4 * Math.sin(TAU * 7.3 * t) * Math.sin(TAU * 0.37 * t);
        rat[0].tick(nr[0].white());
        rat[1].tick(nr[1].white());
        L[i] += (x + rat[0].bpn() * o.rattle * ra) * o.level;
        R[i] += (x * 0.9 + rat[1].bpn() * o.rattle * ra) * o.level;
      }
    };
  };

/** A meadow's insects: a soft high shimmer of wings, rising and falling. */
const insects =
  (o: { level: number }): GenMaker =>
  (sr, r) => {
    const n = [new Noise(rand(r() * 1e9)), new Noise(rand(r() * 1e9))];
    const bp = [new SVF(sr, 5600, 3), new SVF(sr, 6400, 3)];
    const w = [wobble(r, 5), wobble(r, 5)];
    return (L, R, i0, i1) => {
      for (let c = 0; c < 2; c++) {
        const out = c ? R : L;
        let e = 0;
        for (let i = i0; i < i1; i++) {
          const t = i / sr;
          if ((i & 31) === 0) e = Math.pow(w[c](t), 3);
          bp[c].tick(n[c].white());
          out[i] += bp[c].bpn() * e * (0.6 + 0.4 * Math.sin(TAU * 43 * t + c)) * o.level;
        }
      }
    };
  };

/** A sizzle (woks, a grill): dense crackles and fat spitting, swelling. */
const sizzle =
  (o: { level: number }): GenMaker =>
  (sr, r) => {
    const n = [new Noise(rand(r() * 1e9)), new Noise(rand(r() * 1e9))];
    const hp = [new SVF(sr, 3500, 0.7), new SVF(sr, 3500, 0.7)];
    const w = [wobble(r, 6), wobble(r, 6)];
    return (L, R, i0, i1) => {
      for (let c = 0; c < 2; c++) {
        const out = c ? R : L;
        const rr = n[c].r;
        let e = 0;
        for (let i = i0; i < i1; i++) {
          if ((i & 63) === 0) e = Math.pow(w[c](i / sr), 2);
          const crack = rr() < 0.004 ? (rr() * 2 - 1) * 6 : 0;
          hp[c].tick(n[c].white() * 0.5 + crack);
          out[i] += hp[c].hp * e * o.level;
        }
      }
    };
  };

// ---- the events (one-shots) ----------------------------------------------------------------------------

type EvMaker = (s: Sig, r: Rand) => void;
interface EvDef {
  len: number;
  make: EvMaker;
}

function chirp(s: Sig, t0: number, f0: number, f1: number, dur: number, amp: number, p = 0, shape = 1) {
  const sr = s.sr;
  const o = new Osc(sr);
  const i0 = Math.floor(t0 * sr);
  pan(p, P);
  for (let i = 0; i < dur * sr && i0 + i < s.n; i++) {
    const u = i / (dur * sr);
    const x = o.sine(f0 + (f1 - f0) * Math.pow(u, shape)) * amp * Math.sin(u * Math.PI);
    s.L[i0 + i] += x * P[0];
    s.R[i0 + i] += x * P[1];
  }
}

function strike(s: Sig, t0: number, f: number, ratios: number[], amp: number, tau: number, p = 0) {
  const sr = s.sr;
  const i0 = Math.floor(t0 * sr);
  pan(p, P);
  ratios.forEach((k, j) => {
    const w = (TAU * f * k) / sr;
    if (f * k > sr * 0.45) return;
    const tk = tau / (1 + j * 0.6);
    const a = amp / (1 + j * 0.7);
    for (let i = 0; i < tk * 7 * sr && i0 + i < s.n; i++) {
      const x = Math.sin(w * i) * a * Math.exp(-i / sr / tk) * Math.min(1, i / (sr * 0.001));
      s.L[i0 + i] += x * P[0];
      s.R[i0 + i] += x * P[1];
    }
  });
}

function noiseHit(s: Sig, r: Rand, t0: number, fc: number, q: number, amp: number, a: number, tau: number, mode: "bp" | "lp" | "hp" = "bp") {
  const sr = s.sr;
  const f = new SVF(sr, fc, q);
  const i0 = Math.floor(t0 * sr);
  for (let i = 0; i < (a + tau * 6) * sr && i0 + i < s.n; i++) {
    f.tick(r() * 2 - 1);
    const x = (mode === "bp" ? f.bpn() : mode === "lp" ? f.lp : f.hp) * amp * ad(i / sr, a, tau);
    s.L[i0 + i] += x;
    s.R[i0 + i] += x;
  }
}

/** A voiced cry through formants (a gull, a vendor's call, a whoop). */
function cry(s: Sig, t0: number, dur: number, pitch: (u: number) => number, f1: number, f2: number, amp: number, saw = 1) {
  const sr = s.sr;
  const o = new Osc(sr);
  const a = new SVF(sr, f1, 5);
  const b = new SVF(sr, f2, 6);
  const i0 = Math.floor(t0 * sr);
  for (let i = 0; i < dur * sr && i0 + i < s.n; i++) {
    const u = i / (dur * sr);
    const src = saw ? o.saw(pitch(u)) : o.sine(pitch(u));
    a.tick(src);
    b.tick(src);
    const x = (a.bpn() + b.bpn() * 0.7) * amp * Math.pow(Math.sin(u * Math.PI), 0.6);
    s.L[i0 + i] += x;
    s.R[i0 + i] += x;
  }
}

const EV: Record<string, EvDef> = {
  bird: {
    len: 1.2,
    make(s, r) {
      let t = 0;
      const base = 2600 + r() * 2000;
      const k = 2 + Math.floor(r() * 4);
      for (let j = 0; j < k; j++) {
        const d = 0.05 + r() * 0.09;
        chirp(s, t, base * (0.8 + r() * 0.4), base * (0.7 + r() * 0.8), d, 0.5, 0, 0.6 + r());
        t += d + 0.03 + r() * 0.08;
      }
    },
  },
  gull: {
    len: 1.6,
    make(s, r) {
      const k = 2 + Math.floor(r() * 3);
      for (let j = 0; j < k; j++) {
        const f = 900 + r() * 300;
        cry(s, j * (0.28 + r() * 0.1), 0.24 + r() * 0.1, (u) => f * (1.25 - 0.5 * u) * (1 + 0.04 * Math.sin(u * 40)), 1500, 3000, 0.5);
      }
    },
  },
  horn: {
    len: 0.9,
    make(s, r) {
      const sr = s.sr;
      const o1 = new Osc(sr);
      const o2 = new Osc(sr);
      const lp = new SVF(sr, 1100, 1);
      const d = 0.25 + r() * 0.45;
      for (let i = 0; i < s.n; i++) {
        const t = i / sr;
        const e = t < d ? Math.min(1, t / 0.02) : Math.exp(-(t - d) / 0.04);
        s.add(i, lp.tick(o1.pulse(392, 0.4) + o2.pulse(494, 0.4)) * 0.4 * e);
      }
    },
  },
  siren: {
    len: 5,
    make(s, r) {
      const sr = s.sr;
      const o = new Osc(sr);
      const lp = new SVF(sr, 1400, 0.8);
      const sp = 0.35 + r() * 0.2;
      for (let i = 0; i < s.n; i++) {
        const t = i / sr;
        const f = 750 + 450 * (0.5 - 0.5 * Math.cos(TAU * sp * t));
        s.add(i, lp.tick(o.tri(f)) * 0.5 * bump(t, 0, 5));
      }
    },
  },
  trainhorn: {
    len: 2.6,
    make(s, r) {
      const sr = s.sr;
      const os = [new Osc(sr), new Osc(sr), new Osc(sr)];
      const lp = new SVF(sr, 900, 1.2);
      const d = 1.2 + r() * 0.8;
      for (let i = 0; i < s.n; i++) {
        const t = i / sr;
        const e = t < d ? Math.min(1, t / 0.08) : Math.exp(-(t - d) / 0.15);
        s.add(i, lp.tick(os[0].saw(277) + os[1].saw(330) + os[2].saw(415)) * 0.3 * e);
      }
    },
  },
  buoy: {
    len: 4,
    make(s, r) {
      strike(s, 0, 280 + r() * 60, [1, 2.4, 2.98, 4.1, 5.3], 0.5, 1.5);
    },
  },
  creak: {
    len: 1.4,
    make(s, r) {
      const sr = s.sr;
      const bp = new SVF(sr, 700, 4);
      const d = 0.5 + r() * 0.7;
      let ph = 0;
      for (let i = 0; i < s.n; i++) {
        const t = i / sr;
        // stick-slip: a train of little clicks, its rate sliding
        const rate = 60 + 80 * Math.sin((t / d) * Math.PI) + r() * 20;
        ph += rate / sr;
        const imp = ph >= 1 ? ((ph -= 1), 1) : 0;
        bp.tick(imp * 3);
        s.add(i, bp.bpn() * 0.6 * bump(t, 0, d));
      }
    },
  },
  clank: {
    len: 1.6,
    make(s, r) {
      const f = 240 + r() * 400;
      strike(s, 0, f, [1, 2.32, 3.86, 5.41, 7.1], 0.6, 0.35 + r() * 0.3);
      noiseHit(s, r, 0, 3000, 1, 0.4, 0.001, 0.008);
    },
  },
  hammer: {
    len: 0.9,
    make(s, r) {
      noiseHit(s, r, 0, 300, 0.8, 0.9, 0.001, 0.05, "lp");
      strike(s, 0, 520 + r() * 200, [1, 2.7, 4.2], 0.5, 0.18);
      noiseHit(s, r, 0, 2500, 1.5, 0.4, 0.0005, 0.01);
    },
  },
  steam: {
    len: 2.2,
    make(s, r) {
      noiseHit(s, r, 0, 2400 + r() * 1500, 0.8, 0.5, 0.15, 0.45, "hp");
    },
  },
  beep: {
    len: 0.7,
    make(s, r) {
      const f = [880, 1175, 1320, 1568, 1760][Math.floor(r() * 5)];
      const n = 1 + Math.floor(r() * 3);
      for (let j = 0; j < n; j++) strike(s, j * 0.14, f * (j % 2 ? 1.5 : 1), [1], 0.4, 0.04);
    },
  },
  servo: {
    len: 1.1,
    make(s, r) {
      const sr = s.sr;
      const o = new Osc(sr);
      const bp = new SVF(sr, 900, 2);
      const d = 0.4 + r() * 0.5;
      const up = r() < 0.5;
      for (let i = 0; i < s.n; i++) {
        const t = i / sr;
        const u = Math.min(1, t / d);
        const f = up ? 110 + 70 * u : 180 - 70 * u;
        bp.tick(o.saw(f) + (r() * 2 - 1) * 0.2);
        s.add(i, bp.bpn() * 0.4 * bump(t, 0, d + 0.05));
      }
    },
  },
  drip: {
    len: 0.4,
    make(s, r) {
      const f = 900 + r() * 1100;
      chirp(s, 0, f, f * 2.2, 0.035, 0.6);
      chirp(s, 0.02, f * 1.5, f * 1.2, 0.08, 0.15);
    },
  },
  far: {
    len: 3.5,
    make(s, r) {
      noiseHit(s, r, 0, 120, 0.7, 1, 0.4, 0.8, "lp");
    },
  },
  wok: {
    len: 1.8,
    make(s, r) {
      strike(s, 0, 600 + r() * 200, [1, 1.9, 3.1, 4.4], 0.35, 0.25);
      noiseHit(s, r, 0.05, 4500, 0.7, 0.45, 0.05, 0.4, "hp");
    },
  },
  call: {
    len: 1.4,
    make(s, r) {
      const f = 170 + r() * 90;
      const d = 0.6 + r() * 0.5;
      cry(s, 0, d, (u) => f * (1 + 0.25 * Math.sin(u * Math.PI) - 0.1 * u), 700, 1150, 0.6);
    },
  },
  whoop: {
    len: 1,
    make(s, r) {
      const f = 260 + r() * 150;
      cry(s, 0, 0.55 + r() * 0.3, (u) => f * (1 + 0.6 * u), 450, 900, 0.55);
    },
  },
  whistle: {
    len: 1.2,
    make(s, r) {
      const f = 2000 + r() * 900;
      chirp(s, 0, f, f * 1.25, 0.25, 0.4);
      chirp(s, 0.3, f * 1.25, f * 0.95, 0.5, 0.4);
    },
  },
  claps: {
    len: 2.4,
    make(s, r) {
      const n = 60 + Math.floor(r() * 50);
      for (let k = 0; k < n; k++) {
        const t = r() * 1.9;
        noiseHit(s, r, t, 1000 + r() * 1500, 1.3, 0.25 * bump(t, -0.2, 2.1), 0.0005, 0.011);
      }
    },
  },
  clinks: {
    len: 1.2,
    make(s, r) {
      const f = 2600 + r() * 1400;
      strike(s, 0, f, [1, 2.03, 2.9], 0.4, 0.25);
      if (r() < 0.6) strike(s, 0.08 + r() * 0.1, f * 1.07, [1, 2.03], 0.3, 0.2);
    },
  },
  bee: {
    len: 2.4,
    make(s, r) {
      const sr = s.sr;
      const o = new Osc(sr);
      const bp = new SVF(sr, 600, 1.5);
      const f = 210 + r() * 60;
      for (let i = 0; i < s.n; i++) {
        const t = i / sr;
        bp.tick(o.saw(f * (1 + 0.03 * Math.sin(TAU * 3 * t))));
        s.add(i, bp.bpn() * 0.3 * bump(t, 0, 2.4));
      }
    },
  },
};

// ---- the beds ------------------------------------------------------------------------------------------

interface Layer {
  len: number;
  make: GenMaker;
}
interface Event {
  /** An event of EV, or an effect of ./sfx.ts ("sfx:thunder"). */
  ev: string;
  /** Seconds between two (min, max). */
  every: [number, number];
  /** Level (min, max), pitch spread (± fraction), pan spread (± ), room send. */
  gain: [number, number];
  vary?: number;
  spread?: number;
  send?: number;
}
interface BedDef {
  room: RoomKind;
  level: number;
  layers: Layer[];
  events: Event[];
}

const BEDS: Record<AmbienceKind, BedDef> = {
  "city-day": {
    room: "outdoor",
    level: 0.37,
    layers: [
      { len: 11.3, make: traffic({ level: 0.5, cars: 7 }) },
      { len: 7.9, make: wind({ lo: 400, hi: 1600, q: 0.7, level: 0.18, gusty: 0.4 }) },
    ],
    events: [
      { ev: "bird", every: [2, 6], gain: [0.08, 0.2], vary: 0.15, spread: 0.9, send: 0.25 },
      { ev: "horn", every: [9, 22], gain: [0.05, 0.12], vary: 0.05, spread: 0.8, send: 0.6 },
    ],
  },
  "city-night": {
    room: "outdoor",
    level: 0.61,
    layers: [
      { len: 11.3, make: traffic({ level: 0.32, cars: 4 }) },
      { len: 6.7, make: crickets({ n: 4, level: 0.05 }) },
    ],
    events: [
      { ev: "siren", every: [22, 50], gain: [0.03, 0.06], vary: 0.05, spread: 0.8, send: 0.8 },
      { ev: "horn", every: [14, 35], gain: [0.03, 0.07], vary: 0.05, spread: 0.8, send: 0.7 },
      { ev: "trainhorn", every: [40, 80], gain: [0.03, 0.05], vary: 0.03, spread: 0.6, send: 0.9 },
    ],
  },
  meadow: {
    room: "outdoor",
    level: 0.5,
    layers: [
      { len: 10.7, make: wind({ lo: 350, hi: 1200, q: 0.6, level: 0.22, gusty: 0.5, speed: 0.8 }) },
      { len: 7.3, make: insects({ level: 0.05 }) },
    ],
    events: [
      { ev: "bird", every: [1.2, 3.5], gain: [0.1, 0.25], vary: 0.2, spread: 0.9, send: 0.3 },
      { ev: "bee", every: [12, 25], gain: [0.04, 0.08], vary: 0.1, spread: 0.8, send: 0.1 },
    ],
  },
  wind: {
    room: "outdoor",
    level: 0.47,
    layers: [
      { len: 12.7, make: wind({ lo: 250, hi: 1400, q: 1.1, level: 0.5, gusty: 0.7, howl: 0.25 }) },
      { len: 7.1, make: hiss({ fc: 4500, level: 0.05, am: 0.6 }) },
    ],
    events: [{ ev: "sfx:gust", every: [6, 13], gain: [0.15, 0.35], vary: 0.1, spread: 0.7, send: 0.3 }],
  },
  rain: {
    room: "outdoor",
    level: 0.16,
    layers: [
      { len: 9.1, make: rain({ density: 900, level: 0.45 }) },
      { len: 6.3, make: rumble({ fc: 300, level: 0.25, am: 0.3 }) },
    ],
    events: [
      { ev: "sfx:thunder", every: [25, 55], gain: [0.18, 0.3], vary: 0.08, spread: 0.6, send: 1.5 },
      { ev: "drip", every: [1.5, 4], gain: [0.05, 0.12], vary: 0.2, spread: 0.9, send: 0.4 },
    ],
  },
  storm: {
    room: "outdoor",
    level: 0.13,
    layers: [
      { len: 9.1, make: rain({ density: 2200, level: 0.5, heavy: 0.5 }) },
      { len: 12.7, make: wind({ lo: 220, hi: 1100, q: 1, level: 0.42, gusty: 0.8, howl: 0.3 }) },
    ],
    events: [
      { ev: "sfx:thunder", every: [9, 20], gain: [0.25, 0.42], vary: 0.08, spread: 0.6, send: 1 },
      { ev: "sfx:gust", every: [7, 14], gain: [0.25, 0.4], vary: 0.1, spread: 0.7, send: 0.3 },
    ],
  },
  sea: {
    room: "outdoor",
    level: 0.36,
    layers: [
      { len: 13.1, make: waves({ level: 0.45, every: [5, 8] }) },
      { len: 7.7, make: wind({ lo: 300, hi: 1100, q: 0.7, level: 0.16, gusty: 0.5 }) },
    ],
    events: [
      { ev: "gull", every: [4, 11], gain: [0.05, 0.12], vary: 0.1, spread: 0.9, send: 0.5 },
      { ev: "buoy", every: [12, 26], gain: [0.04, 0.07], vary: 0.03, spread: 0.7, send: 0.7 },
      { ev: "creak", every: [8, 18], gain: [0.04, 0.08], vary: 0.15, spread: 0.6, send: 0.3 },
    ],
  },
  crowd: {
    room: "hall",
    level: 0.58,
    layers: [
      { len: 10.3, make: babble({ streams: 10, level: 0.55, bright: 0.4, mass: 0.6 }) },
      { len: 6.9, make: rumble({ fc: 260, level: 0.25, am: 0.4, mid: 0.4 }) },
    ],
    events: [
      { ev: "claps", every: [6, 14], gain: [0.08, 0.16], vary: 0.05, spread: 0.6, send: 0.5 },
      { ev: "whistle", every: [8, 20], gain: [0.04, 0.08], vary: 0.1, spread: 0.9, send: 0.6 },
      { ev: "whoop", every: [5, 12], gain: [0.05, 0.1], vary: 0.15, spread: 0.9, send: 0.6 },
    ],
  },
  club: {
    room: "club",
    level: 0.66,
    layers: [
      { len: 10.3, make: babble({ streams: 7, level: 0.45, bright: 0.2, mass: 0.35, pitch: 1.1 }) },
      { len: 7.9, make: hum({ f: [[60, 0.05], [120, 0.03], [180, 0.012]], level: 0.6, air: 0.25, airFc: 900 }) },
    ],
    events: [
      { ev: "clinks", every: [4, 9], gain: [0.04, 0.1], vary: 0.08, spread: 0.9, send: 0.4 },
      { ev: "whoop", every: [8, 18], gain: [0.05, 0.1], vary: 0.15, spread: 0.9, send: 0.5 },
    ],
  },
  space: {
    room: "space",
    level: 0.48,
    layers: [
      { len: 12.1, make: hum({ f: [[55, 0.09], [55.4, 0.07], [110.2, 0.05], [164.9, 0.03], [220.6, 0.015]], level: 0.8, air: 0.18, airFc: 700 }) },
      { len: 7.3, make: hiss({ fc: 900, level: 0.04, top: 3000, am: 0.5 }) },
    ],
    events: [
      { ev: "beep", every: [5, 12], gain: [0.03, 0.06], vary: 0.02, spread: 0.8, send: 0.7 },
      { ev: "servo", every: [9, 20], gain: [0.05, 0.09], vary: 0.1, spread: 0.8, send: 0.5 },
      { ev: "far", every: [18, 40], gain: [0.15, 0.25], vary: 0.1, spread: 0.5, send: 0.6 },
    ],
  },
  foundry: {
    room: "hall",
    level: 0.49,
    layers: [
      { len: 11.3, make: rumble({ fc: 200, level: 0.55, am: 0.4, mid: 0.35 }) },
      { len: 9.6, make: pulse({ per: 1.6, hits: [[0, 1]], f: 55, click: 900, level: 0.22, rattle: 0.12 }) },
    ],
    events: [
      { ev: "clank", every: [3, 7], gain: [0.05, 0.11], vary: 0.15, spread: 0.9, send: 0.6 },
      { ev: "steam", every: [8, 16], gain: [0.05, 0.1], vary: 0.1, spread: 0.8, send: 0.4 },
      { ev: "hammer", every: [5, 10], gain: [0.06, 0.12], vary: 0.1, spread: 0.8, send: 0.5 },
    ],
  },
  market: {
    room: "outdoor",
    level: 1.1,
    layers: [
      { len: 10.3, make: babble({ streams: 8, level: 0.5, bright: 0.5, mass: 0.3 }) },
      { len: 7.1, make: sizzle({ level: 0.06 }) },
    ],
    events: [
      { ev: "wok", every: [5, 11], gain: [0.04, 0.09], vary: 0.1, spread: 0.8, send: 0.4 },
      { ev: "call", every: [6, 14], gain: [0.05, 0.1], vary: 0.12, spread: 0.9, send: 0.5 },
      { ev: "clinks", every: [9, 18], gain: [0.03, 0.06], vary: 0.1, spread: 0.9, send: 0.4 },
    ],
  },
  cave: {
    room: "cave",
    level: 0.62,
    layers: [
      { len: 12.7, make: wind({ lo: 150, hi: 600, q: 1.4, level: 0.3, gusty: 0.4, speed: 0.6 }) },
      { len: 8.9, make: rumble({ fc: 90, level: 0.35, am: 0.3 }) },
    ],
    events: [
      { ev: "drip", every: [1.2, 3.5], gain: [0.08, 0.18], vary: 0.25, spread: 0.9, send: 1.2 },
      { ev: "far", every: [20, 40], gain: [0.15, 0.25], vary: 0.1, spread: 0.6, send: 1 },
    ],
  },
  train: {
    room: "outdoor",
    level: 0.6,
    layers: [
      { len: 9.6, make: pulse({ per: 1.2, hits: [[0, 1], [0.14, 0.8]], f: 75, click: 2200, level: 0.3, rattle: 0.18 }) },
      { len: 7.7, make: rumble({ fc: 160, level: 0.45, am: 0.25, mid: 0.25 }) },
    ],
    events: [
      { ev: "creak", every: [6, 13], gain: [0.04, 0.08], vary: 0.15, spread: 0.8, send: 0.2 },
      { ev: "trainhorn", every: [30, 60], gain: [0.04, 0.07], vary: 0.02, spread: 0.4, send: 0.8 },
    ],
  },
};

// ---- rendering and caching ---------------------------------------------------------------------------

/** Rendered layers by context and kind (a promise each: the render runs in slices). */
const layerCache = new WeakMap<BaseAudioContext, Map<AmbienceKind, Promise<AudioBuffer[]>>>();
const recent: AmbienceKind[] = [];

function layersOf(ac: BaseAudioContext, kind: AmbienceKind): Promise<AudioBuffer[]> {
  let m = layerCache.get(ac);
  if (!m) layerCache.set(ac, (m = new Map()));
  const hit = m.get(kind);
  if (hit) return hit;
  const def = BEDS[kind];
  const XF = 1.2;
  const p = Promise.all(
    def.layers.map(async (ly, k) => {
      const r = rand(0xa11 + k * 977 + kind.length * 31 + kind.charCodeAt(0));
      const s = new Sig(SR, ly.len + XF);
      const g = ly.make(SR, r, ly.len + XF);
      await chunked(s.n, (i0, i1) => g(s.L, s.R, i0, i1));
      // (a stray peak in a loop would tick at every turn: tame it)
      for (let i = 0; i < s.n; i++) ((s.L[i] = soft(s.L[i] * 1.2) / 1.2), (s.R[i] = soft(s.R[i] * 1.2) / 1.2));
      return s.loop(XF).buffer(ac);
    }),
  );
  m.set(kind, p);
  // keep the last three kinds
  const i = recent.indexOf(kind);
  if (i >= 0) recent.splice(i, 1);
  recent.push(kind);
  while (recent.length > 3) m.delete(recent.shift()!);
  return p;
}

const evCache = new WeakMap<BaseAudioContext, Map<string, AudioBuffer[]>>();
/** An event's buffer (three variants each, rendered on first use; they are short). */
function evBuffer(ac: BaseAudioContext, name: string): AudioBuffer {
  let m = evCache.get(ac);
  if (!m) evCache.set(ac, (m = new Map()));
  let vs = m.get(name);
  if (!vs) m.set(name, (vs = []));
  const v = Math.floor(Math.random() * 3);
  if (vs[v]) return vs[v];
  const d = EV[name];
  const s = new Sig(SR, d.len);
  d.make(s, rand(0xe7 + v * 4111 + name.length * 59));
  s.norm(0.9).edges(0.003, 0.05);
  return (vs[v] = s.buffer(ac));
}

// ---- the player ------------------------------------------------------------------------------------------

class Bed {
  readonly out: GainNode;
  private srcs: AudioBufferSourceNode[] = [];
  private next: number[];
  dead = false;
  constructor(
    readonly m: Mixer,
    readonly kind: AmbienceKind,
    fade: number,
    at: number,
  ) {
    const ac = m.ac;
    this.out = ac.createGain();
    this.out.gain.value = 0;
    this.out.connect(m.amb);
    const def = BEDS[kind];
    this.next = def.events.map((e) => at + e.every[0] * (0.3 + Math.random() * 0.7));
    void layersOf(ac, kind).then((bufs) => {
      if (this.dead) return;
      const t = Math.max(at, ac.currentTime + 0.02);
      for (const b of bufs) {
        const s = ac.createBufferSource();
        s.buffer = b;
        s.loop = true;
        s.connect(this.out);
        s.start(t, Math.random() * b.duration);
        this.srcs.push(s);
      }
      this.out.gain.setValueAtTime(0, t);
      this.out.gain.setTargetAtTime(def.level, t, Math.max(0.05, fade / 3));
    });
  }
  /** Fires the events due before `until`. */
  pump(until: number) {
    if (this.dead) return;
    const def = BEDS[this.kind];
    def.events.forEach((e, k) => {
      while (this.next[k] < until) {
        this.fire(e, this.next[k]);
        this.next[k] += e.every[0] + Math.random() * (e.every[1] - e.every[0]);
      }
    });
  }
  fire(e: Event, t: number) {
    const ac = this.m.ac;
    const g = e.gain[0] + Math.random() * (e.gain[1] - e.gain[0]);
    const p = (Math.random() * 2 - 1) * (e.spread ?? 0.7);
    if (e.ev.startsWith("sfx:")) {
      playSfx(e.ev.slice(4) as SfxName, { gain: g / 0.5, pan: p, delay: Math.max(0, t - ac.currentTime), send: e.send ?? 0.5 }, this.m);
      return;
    }
    const s = ac.createBufferSource();
    s.buffer = evBuffer(ac, e.ev);
    s.playbackRate.value = 1 + (Math.random() * 2 - 1) * (e.vary ?? 0.05);
    const gn = ac.createGain();
    gn.gain.value = g;
    const pn = ac.createStereoPanner();
    pn.pan.value = p;
    s.connect(gn).connect(pn).connect(this.out);
    const sg = ac.createGain();
    sg.gain.value = e.send ?? 0.4;
    pn.connect(sg).connect(this.m.roomSend);
    s.onended = () => (s.disconnect(), gn.disconnect(), pn.disconnect(), sg.disconnect());
    s.start(Math.max(t, ac.currentTime));
  }
  swell(k: number, secs: number) {
    const def = BEDS[this.kind];
    const p = this.out.gain;
    const t = this.m.ac.currentTime;
    p.cancelScheduledValues(t);
    p.setTargetAtTime(def.level * k, t, 0.15);
    p.setTargetAtTime(def.level, t + secs, 0.6);
  }
  stop(fade: number) {
    if (this.dead) return;
    this.dead = true;
    const ac = this.m.ac;
    const t = ac.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(0, t, Math.max(0.02, fade / 4));
    for (const s of this.srcs) s.stop(t + fade + 0.2);
    setTimeout(() => this.out.disconnect(), (fade + 0.4) * 1000);
  }
}

class AmbiencePlayer {
  /** The bed asked for (it plays once the sound is on), null when none. */
  kind: AmbienceKind | null = null;
  private bed: Bed | null = null;
  private timer = 0;
  constructor() {
    if (typeof window === "undefined") return;
    master.watch((on) => {
      // switched back on: the bed that was asked for comes back
      if (on && this.kind && !this.bed) this.start(this.kind, 1.5);
    });
  }
  /** Cross-fades to a bed (null: none). Also sets the mixer's room. */
  play(kind: AmbienceKind | null, fade = 1.5) {
    if (kind === this.kind && this.bed) return;
    this.kind = kind;
    this.bed?.stop(fade);
    this.bed = null;
    if (kind) this.start(kind, fade);
    else this.idle();
  }
  stop(fade = 1) {
    this.play(null, fade);
  }
  /** Louder (k > 1) or softer for `secs`, then back (a crowd at a goal). */
  swell(k = 1.6, secs = 2) {
    this.bed?.swell(k, secs);
  }
  /** One of the bed's one-shots now (an event of the bed: "thunder" → its thunder; or any EV name / sfx). */
  event(name: string, gain = 1) {
    const b = this.bed;
    if (!b) return;
    const e = BEDS[b.kind].events.find((x) => x.ev === name || x.ev === `sfx:${name}`) ?? { ev: EV[name] ? name : `sfx:${name}`, every: [9, 9], gain: [0.3, 0.3] };
    b.fire({ ...e, gain: [e.gain[1] * gain, e.gain[1] * gain] }, b.m.ac.currentTime + 0.01);
  }
  private start(kind: AmbienceKind, fade: number) {
    const m = party();
    if (!m) return;
    m.room(BEDS[kind].room);
    this.bed = new Bed(m, kind, fade, m.ac.currentTime + 0.05);
    if (!this.timer) this.timer = window.setInterval(this.tick, 250);
  }
  private idle() {
    window.clearInterval(this.timer);
    this.timer = 0;
  }
  private tick = () => {
    const b = this.bed;
    if (!b || !master.on || document.hidden) return;
    b.pump(b.m.ac.currentTime + 0.4);
  };
}

/** The one ambience player. */
export const ambience = new AmbiencePlayer();

/** The room a bed rings in (for a scene that wants it without the bed). */
export const roomOf = (kind: AmbienceKind): RoomKind => BEDS[kind].room;

/** The bench: renders `kind` for `secs` into an offline context's mixer (its loops and events). */
export async function ambienceBounce(ctx: BaseAudioContext, kind: AmbienceKind, secs: number) {
  const m = mixerFor(ctx);
  m.room(BEDS[kind].room);
  await layersOf(ctx, kind);
  const b = new Bed(m, kind, 0.5, 0.02);
  await layersOf(ctx, kind);
  b.pump(secs);
  return b;
}

export const AMBIENCE_KINDS = Object.keys(BEDS) as AmbienceKind[];

/** The bench: a kind's rendered loops (two buffers), on any context. */
export const bedBuffers = (ac: BaseAudioContext, kind: AmbienceKind) => layersOf(ac, kind);
