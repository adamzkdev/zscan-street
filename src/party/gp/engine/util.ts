/** Small maths and timing helpers shared by everything on the TV. */

export type Rnd = () => number;

/** A seeded random (mulberry32): `const r = rng(42); r()` → [0, 1). */
export function rng(seed: number): Rnd {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** Frame-rate independent smoothing: move `a` toward `b` with `rate` (1/s). */
export const damp = (a: number, b: number, rate: number, dt: number) => lerp(a, b, 1 - Math.exp(-rate * dt));
export const rand = (r: Rnd, a: number, b: number) => a + (b - a) * r();
export const randInt = (r: Rnd, a: number, b: number) => a + Math.floor(r() * (b - a + 1));
export const pick = <T>(r: Rnd, arr: readonly T[]): T => arr[Math.floor(r() * arr.length)];
export function shuffle<T>(r: Rnd, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
/** Shortest signed difference between two angles. */
export const angDiff = (a: number, b: number) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};
/** Turn angle `a` toward `b` by at most `step`. */
export const turnToward = (a: number, b: number, step: number) => {
  const d = angDiff(a, b);
  return Math.abs(d) <= step ? b : a + Math.sign(d) * step;
};
export const dist2 = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);

// easing
export const easeOutBack = (t: number) => {
  const c1 = 1.70158,
    c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutElastic = (t: number) => (t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1);

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** A promise that resolves after `s` seconds of *game* time (see `Clock`). */
export class Waiters {
  private list: { at: number; res: () => void }[] = [];
  now = 0;
  wait(s: number) {
    return new Promise<void>((res) => this.list.push({ at: this.now + s, res }));
  }
  tick(dt: number) {
    this.now += dt;
    const due = this.list.filter((w) => w.at <= this.now);
    if (due.length) {
      this.list = this.list.filter((w) => w.at > this.now);
      for (const w of due) w.res();
    }
  }
}

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
