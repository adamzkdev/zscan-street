/**
 * The deterministic maths against the engine's own: how far apart they are (in ulps, units in the
 * last place), on inputs in the ranges games use and beyond; and what each call costs. Also a digest
 * of every det result, which must be the same on every engine.
 */
import { DET_MATH, pow } from "../det";
import { Hasher } from "../hash";
import { rng } from "../../kit";

const F = new Float64Array(1);
const B = new BigInt64Array(F.buffer);
/** A double's place on the number line, as an integer (so the gap between two is in ulps). */
const ord = (x: number) => {
  F[0] = x;
  const b = B[0];
  return b < 0n ? -(b & 0x7fffffffffffffffn) : b;
};
const ulps = (a: number, b: number) => {
  if (a !== a && b !== b) return 0;
  if (a !== a || b !== b) return Infinity;
  const d = ord(a) - ord(b);
  return Number(d < 0n ? -d : d);
};

type Fn = (...a: number[]) => number;
/** Each function's inputs: (random 0..1) → its arguments. */
const DOMAINS: Record<string, (r: () => number) => number[]> = {
  sin: (r) => [(r() - 0.5) * (r() < 0.8 ? 20 : 2e5)],
  cos: (r) => [(r() - 0.5) * (r() < 0.8 ? 20 : 2e5)],
  tan: (r) => [(r() - 0.5) * 10],
  asin: (r) => [r() * 2 - 1],
  acos: (r) => [r() * 2 - 1],
  atan: (r) => [(r() - 0.5) * (r() < 0.5 ? 4 : 1e4)],
  atan2: (r) => [(r() - 0.5) * 100, (r() - 0.5) * 100],
  exp: (r) => [(r() - 0.5) * (r() < 0.8 ? 10 : 1400)],
  expm1: (r) => [(r() - 0.5) * (r() < 0.5 ? 1 : 80)],
  // (det's pow: the inputs must be the same on every engine for the digest)
  log: (r) => [r() < 0.5 ? r() * 10 : pow(10, (r() - 0.5) * 40)],
  log1p: (r) => [r() * 10 - 0.999],
  log2: (r) => [r() * 1000],
  log10: (r) => [r() * 1000],
  pow: (r) => [r() * 10, (r() - 0.5) * 8],
  hypot: (r) => [(r() - 0.5) * 100, (r() - 0.5) * 100],
  sinh: (r) => [(r() - 0.5) * 10],
  cosh: (r) => [(r() - 0.5) * 10],
  tanh: (r) => [(r() - 0.5) * 10],
  asinh: (r) => [(r() - 0.5) * 100],
  acosh: (r) => [1 + r() * 100],
  atanh: (r) => [r() * 2 - 1],
  cbrt: (r) => [(r() - 0.5) * 1000],
};
/** Edge values every function must handle as the spec says. */
const EDGES = [0, -0, 1, -1, 0.5, -0.5, 2, Math.PI, -Math.PI, Math.PI / 2, 1e-300, 5e-324, 1e6, 1.7e9, 1e22, 1e300, Infinity, -Infinity, NaN];

export interface DetCheck {
  fn: string;
  n: number;
  /** Results equal to the engine's own, bit for bit (a share), and the largest gap in ulps. */
  same: number;
  maxUlps: number;
  /** The edge values where det and the engine disagree beyond 1 ulp. */
  edgeOff: string[];
  /** ns per call: det, native. */
  detNs: number;
  nativeNs: number;
}

export function detCheck(n: number, seed = 1): { rows: DetCheck[]; digest: string } {
  const M = Math as unknown as Record<string, Fn>;
  const rows: DetCheck[] = [];
  const dg = new Hasher();
  for (const [fn, f] of Object.entries(DET_MATH) as [string, Fn][]) {
    const nat = M[fn];
    const r = rng(seed + fn.length * 7919);
    const args: number[][] = [];
    for (let i = 0; i < n; i++) args.push(DOMAINS[fn](r));
    let same = 0,
      max = 0;
    for (const a of args) {
      const x = f(...a),
        y = nat(...a);
      F[0] = x;
      dg.int(Number(B[0] & 0xffffffffn)).int(Number((B[0] >> 32n) & 0xffffffffn));
      if (Object.is(x, y)) same++;
      max = Math.max(max, ulps(x, y));
    }
    const edgeOff: string[] = [];
    for (const e of EDGES) {
      const a = fn === "atan2" || fn === "pow" || fn === "hypot" ? [e, 0.75] : [e];
      const x = f(...a),
        y = nat(...a);
      if (ulps(x, y) > 1 || (Object.is(x, -0) !== Object.is(y, -0) && x === 0)) edgeOff.push(`${fn}(${a.join(", ")}) = ${x} vs ${y}`);
      F[0] = x;
      dg.int(Number(B[0] & 0xffffffffn));
    }
    // the cost of a call: the same inputs, through each
    const time = (g: Fn) => {
      let s = 0;
      const t0 = performance.now();
      for (let k = 0; k < 3; k++) for (const a of args) s += g(a[0], a[1]);
      return { ns: ((performance.now() - t0) * 1e6) / (3 * args.length), s };
    };
    time(f);
    time(nat);
    const td = time(f),
      tn = time(nat);
    rows.push({ fn, n, same: +(same / n).toFixed(4), maxUlps: max, edgeOff, detNs: +td.ns.toFixed(1), nativeNs: +tn.ns.toFixed(1) });
  }
  return { rows, digest: dg.value.toString(16).padStart(8, "0") };
}
