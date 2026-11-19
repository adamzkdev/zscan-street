/**
 * Deterministic maths for lockstep play: the same bits on every engine.
 *
 * JavaScript's Math.sin, exp, pow, atan2… are "implementation-approximated": V8 (Chrome, Android)
 * and JavaScriptCore (Safari, every iPhone browser) may round them differently in the last bit, and
 * a mini-game that rolls on for thousands of ticks turns that bit into a different winner. These are
 * ports of fdlibm (Sun's freely distributable libm, the one V8 itself ships for most of them) that use
 * only + − × ÷, sqrt and integer bit work on the doubles, which IEEE 754 rounds the same everywhere.
 * Accuracy: under 1 ulp for the fdlibm ones (checked against the native ones in test/det-check.ts).
 *
 * `Det` swaps them into Math while a sim tick runs (with a seeded Math.random and a sim clock for
 * performance.now and Date.now), and back out for drawing: see lockstep.ts.
 */

// ---- the words of a double ----------------------------------------------------------------------

const F64 = new Float64Array(1);
const U32 = new Uint32Array(F64.buffer);
// (every browser is little-endian today; the check keeps the bit work right if one is not)
const LE = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
const HI = LE ? 1 : 0;
const LO = LE ? 0 : 1;

/** The high word (sign, exponent, top of the mantissa), as a signed int32. */
function hiw(x: number) {
  F64[0] = x;
  return U32[HI] | 0;
}
/** The low word, unsigned. */
function low(x: number) {
  F64[0] = x;
  return U32[LO];
}
/** A double from its two words. */
function mk(h: number, l: number) {
  U32[HI] = h;
  U32[LO] = l;
  return F64[0];
}
/** `x` with its low word cleared (the trick fdlibm uses to split a double into exact halves). */
function lo0(x: number) {
  F64[0] = x;
  U32[LO] = 0;
  return F64[0];
}
/** `x` with this high word, its low word kept. */
function withHi(x: number, h: number) {
  F64[0] = x;
  U32[HI] = h;
  return F64[0];
}

const sqrt = Math.sqrt;
const abs = Math.abs;

// ---- argument reduction for the trig functions ----------------------------------------------------

const invpio2 = 6.36619772367581382433e-1;
const pio2_1 = 1.57079632673412561417e0;
const pio2_1t = 6.07710050650619224932e-11;
const pio2_2 = 6.07710050630396597660e-11;
const pio2_2t = 2.02226624879595063154e-21;
const pio2_3 = 2.02226624871116645580e-21;
const pio2_3t = 8.47842766036889956997e-32;
const npio2_hw = [
  0x3ff921fb, 0x400921fb, 0x4012d97c, 0x401921fb, 0x401f6a7a, 0x4022d97c, 0x4025fdbb, 0x402921fb, 0x402c463a, 0x402f6a7a, 0x4031475c, 0x4032d97c, 0x40346b9c, 0x4035fdbb, 0x40378fdb, 0x403921fb, 0x403ab41b, 0x403c463a,
  0x403dd85a, 0x403f6a7a, 0x40407e4c, 0x4041475c, 0x4042106c, 0x4042d97c, 0x4043a28c, 0x40446b9c, 0x404534ac, 0x4045fdbb, 0x4046c6cb, 0x40478fdb, 0x404858eb, 0x404921fb,
];

/** The reduced argument (y0 + y1, within ±π/4) of the last remPio2() call. */
let y0 = 0;
let y1 = 0;

/** 2/π in 24-bit chunks (fdlibm's ipio2; generated from π with BigInt, checked against fdlibm). */
const IPIO2 = [
  0xa2f983, 0x6e4e44, 0x1529fc, 0x2757d1, 0xf534dd, 0xc0db62, 0x95993c, 0x439041, 0xfe5163, 0xabdebb, 0xc561b7, 0x246e3a, 0x424dd2, 0xe00649, 0x2eea09, 0xd1921c, 0xfe1deb, 0x1cb129, 0xa73ee8, 0x8235f5, 0x2ebb44, 0x84e99c,
  0x7026b4, 0x5f7e41, 0x3991d6, 0x398353, 0x39f49c, 0x845f8b, 0xbdf928, 0x3b1ff8, 0x97ffde, 0x05980f, 0xef2f11, 0x8b5a0a, 0x6d1f6d, 0x367ecf, 0x27cb09, 0xb74f46, 0x3f669e, 0x5fea2d, 0x7527ba, 0xc7ebe5, 0xf17b3d, 0x0739f7,
  0x8a5292, 0xea6bfb, 0x5fb11f, 0x8d5d08, 0x560330, 0x46fc7b, 0x6babf0, 0xcfbc20, 0x9af436, 0x1da9e3, 0x91615e, 0xe61b08, 0x659985, 0x5f14a0, 0x68408d, 0xffd880, 0x4d7327, 0x310606, 0x1556ca, 0x73a8c9, 0x60e27b, 0xc08c6b,
];
const PIO2 = [1.57079625129699707031e0, 7.54978941586159635335e-8, 5.39030252995776476554e-15, 3.28200341580791294123e-22, 1.27065575308067607349e-29, 1.22933308981111328932e-36, 2.73370053816464559624e-44, 2.16741683877804819444e-51];
const two24 = 1.67772160000000000000e7;
const twon24 = 5.96046447753906250000e-8;

/**
 * fdlibm's __kernel_rem_pio2 (Payne–Hanek) for prec 2: x (as 24-bit pieces `tx`, exponent `e0`)
 * times 2/π, kept modulo 8; the fraction, ×π/2, in (y0, y1). Returns n & 7.
 */
function kRemPio2(tx: number[], e0: number, nx: number): number {
  const jk = 4;
  const jp = jk;
  const jx = nx - 1;
  let jv = ((e0 - 3) / 24) | 0;
  if (jv < 0) jv = 0;
  let q0 = e0 - 24 * (jv + 1);
  const f: number[] = [];
  const q: number[] = [];
  const fq: number[] = [];
  const iq: number[] = [];
  let j = jv - jx;
  const m = jx + jk;
  for (let i = 0; i <= m; i++, j++) f[i] = j < 0 ? 0 : IPIO2[j];
  for (let i = 0; i <= jk; i++) {
    let fw = 0;
    for (j = 0; j <= jx; j++) fw += tx[j] * f[jx + i - j];
    q[i] = fw;
  }
  let jz = jk;
  let z: number, n: number, ih: number, fw: number;
  for (;;) {
    // distill q[] into iq[], backwards
    let i = 0;
    for (j = jz, z = q[jz]; j > 0; i++, j--) {
      fw = (twon24 * z) | 0;
      iq[i] = (z - two24 * fw) | 0;
      z = q[j - 1] + fw;
    }
    z = scalbn(z, q0);
    z -= 8 * Math.floor(z * 0.125);
    n = z | 0;
    z -= n;
    ih = 0;
    if (q0 > 0) {
      i = iq[jz - 1] >> (24 - q0);
      n += i;
      iq[jz - 1] -= i << (24 - q0);
      ih = iq[jz - 1] >> (23 - q0);
    } else if (q0 === 0) ih = iq[jz - 1] >> 23;
    else if (z >= 0.5) ih = 2;
    if (ih > 0) {
      n += 1;
      let carry = 0;
      for (i = 0; i < jz; i++) {
        j = iq[i];
        if (carry === 0) {
          if (j !== 0) {
            carry = 1;
            iq[i] = 0x1000000 - j;
          }
        } else iq[i] = 0xffffff - j;
      }
      if (q0 > 0) {
        if (q0 === 1) iq[jz - 1] &= 0x7fffff;
        else if (q0 === 2) iq[jz - 1] &= 0x3fffff;
      }
      if (ih === 2) {
        z = 1 - z;
        if (carry !== 0) z -= scalbn(1, q0);
      }
    }
    // all zero so far: more of 2/π is needed
    if (z === 0) {
      j = 0;
      for (i = jz - 1; i >= jk; i--) j |= iq[i];
      if (j === 0) {
        let k = 1;
        while (iq[jk - k] === 0) k++;
        for (i = jz + 1; i <= jz + k; i++) {
          f[jx + i] = IPIO2[jv + i];
          fw = 0;
          for (j = 0; j <= jx; j++) fw += tx[j] * f[jx + i - j];
          q[i] = fw;
        }
        jz += k;
        continue;
      }
    }
    break;
  }
  // chop off the zero terms
  if (z === 0) {
    jz -= 1;
    q0 -= 24;
    while (iq[jz] === 0) {
      jz--;
      q0 -= 24;
    }
  } else {
    z = scalbn(z, -q0);
    if (z >= two24) {
      fw = (twon24 * z) | 0;
      iq[jz] = (z - two24 * fw) | 0;
      jz += 1;
      q0 += 24;
      iq[jz] = fw;
    } else iq[jz] = z | 0;
  }
  fw = scalbn(1, q0);
  for (let i = jz; i >= 0; i--) {
    q[i] = fw * iq[i];
    fw *= twon24;
  }
  for (let i = jz; i >= 0; i--) {
    fw = 0;
    for (let k = 0; k <= jp && k <= jz - i; k++) fw += PIO2[k] * q[i + k];
    fq[jz - i] = fw;
  }
  fw = 0;
  for (let i = jz; i >= 0; i--) fw += fq[i];
  y0 = ih === 0 ? fw : -fw;
  fw = fq[0] - fw;
  for (let i = 1; i <= jz; i++) fw += fq[i];
  y1 = ih === 0 ? fw : -fw;
  return n & 7;
}

/** x − n·π/2 in (y0, y1); returns n. fdlibm's __ieee754_rem_pio2. */
function remPio2(x: number): number {
  const hx = hiw(x);
  const ix = hx & 0x7fffffff;
  if (ix <= 0x3fe921fb) {
    y0 = x;
    y1 = 0;
    return 0;
  }
  if (ix < 0x4002d97c) {
    // |x| < 3π/4: n is ±1
    if (hx > 0) {
      let z = x - pio2_1;
      if (ix !== 0x3ff921fb) {
        y0 = z - pio2_1t;
        y1 = z - y0 - pio2_1t;
      } else {
        z -= pio2_2;
        y0 = z - pio2_2t;
        y1 = z - y0 - pio2_2t;
      }
      return 1;
    }
    let z = x + pio2_1;
    if (ix !== 0x3ff921fb) {
      y0 = z + pio2_1t;
      y1 = z - y0 + pio2_1t;
    } else {
      z += pio2_2;
      y0 = z + pio2_2t;
      y1 = z - y0 + pio2_2t;
    }
    return -1;
  }
  if (ix >= 0x7ff00000) {
    y0 = y1 = x - x;
    return 0;
  }
  let t = abs(x);
  if (ix > 0x413921fb) {
    // huge: |x| as three 24-bit pieces, scaled to an exponent of 23, through Payne–Hanek
    const e0 = (ix >> 20) - 1046;
    let z = mk(ix - (e0 << 20), low(x));
    const tx = [0, 0, 0];
    for (let i = 0; i < 2; i++) {
      tx[i] = z | 0;
      z = (z - tx[i]) * two24;
    }
    tx[2] = z;
    let nx = 3;
    while (tx[nx - 1] === 0) nx--;
    const n = kRemPio2(tx, e0, nx);
    if (hx < 0) {
      y0 = -y0;
      y1 = -y1;
      return -n;
    }
    return n;
  }
  const n = (t * invpio2 + 0.5) | 0;
  const fn = n;
  let r = t - fn * pio2_1;
  let w = fn * pio2_1t;
  if (n < 32 && ix !== npio2_hw[n - 1]) {
    y0 = r - w;
  } else {
    const j = ix >> 20;
    y0 = r - w;
    let i = j - ((hiw(y0) >> 20) & 0x7ff);
    if (i > 16) {
      t = r;
      w = fn * pio2_2;
      r = t - w;
      w = fn * pio2_2t - (t - r - w);
      y0 = r - w;
      i = j - ((hiw(y0) >> 20) & 0x7ff);
      if (i > 49) {
        t = r;
        w = fn * pio2_3;
        r = t - w;
        w = fn * pio2_3t - (t - r - w);
        y0 = r - w;
      }
    }
  }
  y1 = r - y0 - w;
  if (hx < 0) {
    y0 = -y0;
    y1 = -y1;
    return -n;
  }
  return n;
}

// ---- sin, cos, tan --------------------------------------------------------------------------------

const S1 = -1.66666666666666324348e-1;
const S2 = 8.33333333332248946124e-3;
const S3 = -1.98412698298579493134e-4;
const S4 = 2.75573137070700676789e-6;
const S5 = -2.50507602534068634195e-8;
const S6 = 1.58969099521155010221e-10;

function kSin(x: number, y: number, iy: number) {
  const ix = hiw(x) & 0x7fffffff;
  if (ix < 0x3e400000 && (x | 0) === 0) return x;
  const z = x * x;
  const v = z * x;
  const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  if (iy === 0) return x + v * (S1 + z * r);
  return x - (z * (0.5 * y - v * r) - y - v * S1);
}

const C1 = 4.16666666666666019037e-2;
const C2 = -1.38888888888741095749e-3;
const C3 = 2.48015872894767294178e-5;
const C4 = -2.75573143513906633035e-7;
const C5 = 2.08757232129817482790e-9;
const C6 = -1.13596475577881948265e-11;

function kCos(x: number, y: number) {
  const ix = hiw(x) & 0x7fffffff;
  if (ix < 0x3e400000 && (x | 0) === 0) return 1;
  const z = x * x;
  const r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  if (ix < 0x3fd33333) return 1 - (0.5 * z - (z * r - x * y));
  const qx = ix > 0x3fe90000 ? 0.28125 : mk(ix - 0x00200000, 0);
  const hz = 0.5 * z - qx;
  const a = 1 - qx;
  return a - (hz - (z * r - x * y));
}

const TT = [
  3.33333333333334091986e-1, 1.33333333333201242699e-1, 5.39682539762260521377e-2, 2.18694882948595424599e-2, 8.86323982359930005737e-3, 3.59207910759131235356e-3, 1.45620945432529025516e-3, 5.88041240820264096874e-4,
  2.46463134818469906812e-4, 7.81794442939557092300e-5, 7.14072491382608190305e-5, -1.85586374855275456654e-5, 2.59073051863633712884e-5,
];
const pio4 = 7.85398163397448278999e-1;
const pio4lo = 3.06161699786838301793e-17;

function kTan(x: number, y: number, iy: number) {
  let z: number, r: number, v: number, w: number, s: number;
  const hx = hiw(x);
  const ix = hx & 0x7fffffff;
  if (ix < 0x3e300000 && (x | 0) === 0) {
    if ((ix | low(x) | (iy + 1)) === 0) return 1 / abs(x);
    if (iy === 1) return x;
    // -1/(x+y), carefully
    w = x + y;
    z = lo0(w);
    v = y - (z - x);
    const a = -1 / w;
    const t = lo0(a);
    s = 1 + t * z;
    return t + a * (s + t * v);
  }
  if (ix >= 0x3fe59428) {
    if (hx < 0) {
      x = -x;
      y = -y;
    }
    z = pio4 - x;
    w = pio4lo - y;
    x = z + w;
    y = 0;
  }
  z = x * x;
  w = z * z;
  r = TT[1] + w * (TT[3] + w * (TT[5] + w * (TT[7] + w * (TT[9] + w * TT[11]))));
  v = z * (TT[2] + w * (TT[4] + w * (TT[6] + w * (TT[8] + w * (TT[10] + w * TT[12])))));
  s = z * x;
  r = y + z * (s * (r + v) + y);
  r += TT[0] * s;
  w = x + r;
  if (ix >= 0x3fe59428) {
    v = iy;
    return (1 - ((hx >> 30) & 2)) * (v - 2 * (x - ((w * w) / (w + v) - r)));
  }
  if (iy === 1) return w;
  z = lo0(w);
  v = r - (z - x);
  const a = -1 / w;
  const t = lo0(a);
  s = 1 + t * z;
  return t + a * (s + t * v);
}

export function sin(x: number): number {
  x = +x;
  const ix = hiw(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) return kSin(x, 0, 0);
  if (ix >= 0x7ff00000) return x - x;
  const n = remPio2(x);
  switch (n & 3) {
    case 0:
      return kSin(y0, y1, 1);
    case 1:
      return kCos(y0, y1);
    case 2:
      return -kSin(y0, y1, 1);
    default:
      return -kCos(y0, y1);
  }
}

export function cos(x: number): number {
  x = +x;
  const ix = hiw(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) return kCos(x, 0);
  if (ix >= 0x7ff00000) return x - x;
  const n = remPio2(x);
  switch (n & 3) {
    case 0:
      return kCos(y0, y1);
    case 1:
      return -kSin(y0, y1, 1);
    case 2:
      return -kCos(y0, y1);
    default:
      return kSin(y0, y1, 1);
  }
}

export function tan(x: number): number {
  x = +x;
  const ix = hiw(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) return kTan(x, 0, 1);
  if (ix >= 0x7ff00000) return x - x;
  const n = remPio2(x);
  return kTan(y0, y1, 1 - ((n & 1) << 1));
}

// ---- atan, atan2, asin, acos ---------------------------------------------------------------------

const atanhi = [4.63647609000806093515e-1, 7.85398163397448278999e-1, 9.82793723247329054082e-1, 1.57079632679489655800e0];
const atanlo = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17];
const aT = [
  3.33333333333329318027e-1, -1.99999999998764832476e-1, 1.42857142725034663711e-1, -1.11111104054623557880e-1, 9.09088713343650656196e-2, -7.69187620504482999495e-2, 6.66107313738753120669e-2, -5.83357013379057348645e-2,
  4.97687799461593236017e-2, -3.65315727442169155270e-2, 1.62858201153657823623e-2,
];

export function atan(x: number): number {
  x = +x;
  const hx = hiw(x);
  const ix = hx & 0x7fffffff;
  let id: number;
  if (ix >= 0x44100000) {
    // |x| ≥ 2^66
    if (x !== x) return x + x;
    return hx > 0 ? atanhi[3] + atanlo[3] : -atanhi[3] - atanlo[3];
  }
  if (ix < 0x3fdc0000) {
    // |x| < 0.4375
    if (ix < 0x3e400000) return x;
    id = -1;
  } else {
    x = abs(x);
    if (ix < 0x3ff30000) {
      if (ix < 0x3fe60000) {
        id = 0;
        x = (2 * x - 1) / (2 + x);
      } else {
        id = 1;
        x = (x - 1) / (x + 1);
      }
    } else if (ix < 0x40038000) {
      id = 2;
      x = (x - 1.5) / (1 + 1.5 * x);
    } else {
      id = 3;
      x = -1 / x;
    }
  }
  const z = x * x;
  const w = z * z;
  const s1 = z * (aT[0] + w * (aT[2] + w * (aT[4] + w * (aT[6] + w * (aT[8] + w * aT[10])))));
  const s2 = w * (aT[1] + w * (aT[3] + w * (aT[5] + w * (aT[7] + w * aT[9]))));
  if (id < 0) return x - x * (s1 + s2);
  const r = atanhi[id] - (x * (s1 + s2) - atanlo[id] - x);
  return hx < 0 ? -r : r;
}

const PI = 3.1415926535897931160e0;
const PI_LO = 1.2246467991473531772e-16;
const PI_O_2 = 1.5707963267948965580e0;
const PI_O_4 = 7.8539816339744827900e-1;

export function atan2(y: number, x: number): number {
  y = +y;
  x = +x;
  if (x !== x || y !== y) return x + y;
  const hx = hiw(x);
  const ix = hx & 0x7fffffff;
  const lx = low(x);
  const hy = hiw(y);
  const iy = hy & 0x7fffffff;
  const ly = low(y);
  if (((hx - 0x3ff00000) | lx) === 0) return atan(y);
  const m = ((hy >>> 31) & 1) | ((hx >>> 30) & 2);
  if ((iy | ly) === 0) {
    // y = ±0
    if (m < 2) return y;
    return m === 2 ? PI : -PI;
  }
  if ((ix | lx) === 0) return hy < 0 ? -PI_O_2 : PI_O_2;
  if (ix === 0x7ff00000) {
    if (iy === 0x7ff00000) return m === 0 ? PI_O_4 : m === 1 ? -PI_O_4 : m === 2 ? 3 * PI_O_4 : -3 * PI_O_4;
    return m === 0 ? 0 : m === 1 ? -0 : m === 2 ? PI : -PI;
  }
  if (iy === 0x7ff00000) return hy < 0 ? -PI_O_2 : PI_O_2;
  const k = (iy - ix) >> 20;
  let z: number;
  if (k > 60) z = PI_O_2 + 0.5 * PI_LO;
  else if (hx < 0 && k < -60) z = 0;
  else z = atan(abs(y / x));
  switch (m) {
    case 0:
      return z;
    case 1:
      return -z;
    case 2:
      return PI - (z - PI_LO);
    default:
      return z - PI_LO - PI;
  }
}

const pio2_hi = 1.57079632679489655800e0;
const pio2_lo = 6.12323399573676603587e-17;
const pio4_hi = 7.85398163397448278999e-1;
const pS0 = 1.66666666666666657415e-1;
const pS1 = -3.25565818622400915405e-1;
const pS2 = 2.01212532134862925881e-1;
const pS3 = -4.00555345006794114027e-2;
const pS4 = 7.91534994289814532176e-4;
const pS5 = 3.47933107596021167570e-5;
const qS1 = -2.40339491173441421878e0;
const qS2 = 2.02094576023350569471e0;
const qS3 = -6.88283971605453293030e-1;
const qS4 = 7.70381505559019352791e-2;

const pS = (t: number) => t * (pS0 + t * (pS1 + t * (pS2 + t * (pS3 + t * (pS4 + t * pS5)))));
const qS = (t: number) => 1 + t * (qS1 + t * (qS2 + t * (qS3 + t * qS4)));

export function asin(x: number): number {
  x = +x;
  const hx = hiw(x);
  const ix = hx & 0x7fffffff;
  let t: number;
  if (ix >= 0x3ff00000) {
    if (((ix - 0x3ff00000) | low(x)) === 0) return x * pio2_hi + x * pio2_lo;
    return NaN;
  }
  if (ix < 0x3fe00000) {
    if (ix < 0x3e400000) return x;
    t = x * x;
    return x + x * (pS(t) / qS(t));
  }
  const w0 = 1 - abs(x);
  t = w0 * 0.5;
  const p = pS(t);
  const q = qS(t);
  const s = sqrt(t);
  if (ix >= 0x3fef3333) {
    t = pio2_hi - (2 * (s + s * (p / q)) - pio2_lo);
  } else {
    const w = lo0(s);
    const c = (t - w * w) / (s + w);
    const r = p / q;
    const pp = 2 * s * r - (pio2_lo - 2 * c);
    const qq = pio4_hi - 2 * w;
    t = pio4_hi - (pp - qq);
  }
  return hx > 0 ? t : -t;
}

export function acos(x: number): number {
  x = +x;
  const hx = hiw(x);
  const ix = hx & 0x7fffffff;
  if (ix >= 0x3ff00000) {
    if (((ix - 0x3ff00000) | low(x)) === 0) return hx > 0 ? 0 : PI + 2 * pio2_lo;
    return NaN;
  }
  if (ix < 0x3fe00000) {
    if (ix <= 0x3c600000) return pio2_hi + pio2_lo;
    const z = x * x;
    const r = pS(z) / qS(z);
    return pio2_hi - (x - (pio2_lo - x * r));
  }
  if (hx < 0) {
    const z = (1 + x) * 0.5;
    const s = sqrt(z);
    const r = pS(z) / qS(z);
    const w = r * s - pio2_lo;
    return PI - 2 * (s + w);
  }
  const z = (1 - x) * 0.5;
  const s = sqrt(z);
  const df = lo0(s);
  const c = (z - df * df) / (s + df);
  const r = pS(z) / qS(z);
  const w = r * s + c;
  return 2 * (df + w);
}

// ---- exp, expm1, log, log1p, log2, log10 ----------------------------------------------------------

const ln2HI = 6.93147180369123816490e-1;
const ln2LO = 1.90821492927058770002e-10;
const invln2 = 1.44269504088896338700e0;
const P1 = 1.66666666666666019037e-1;
const P2 = -2.77777777770155933842e-3;
const P3 = 6.61375632143793436117e-5;
const P4 = -1.65339022054652515390e-6;
const P5 = 4.13813679705723846039e-8;
const o_threshold = 7.09782712893383973096e2;
const u_threshold = -7.45133219101941108420e2;
const twom1000 = 9.33263618503218878990e-302;

export function exp(x: number): number {
  x = +x;
  let hx = hiw(x);
  const xsb = (hx >>> 31) & 1;
  hx &= 0x7fffffff;
  let hi = 0,
    lo = 0,
    k = 0;
  if (hx >= 0x40862e42) {
    if (hx >= 0x7ff00000) {
      if (((hx & 0xfffff) | low(x)) !== 0) return x + x;
      return xsb === 0 ? x : 0;
    }
    if (x > o_threshold) return Infinity;
    if (x < u_threshold) return 0;
  }
  if (hx > 0x3fd62e42) {
    if (hx < 0x3ff0a2b2) {
      hi = xsb ? x + ln2HI : x - ln2HI;
      lo = xsb ? -ln2LO : ln2LO;
      k = 1 - xsb - xsb;
    } else {
      k = (invln2 * x + (xsb ? -0.5 : 0.5)) | 0;
      const t = k;
      hi = x - t * ln2HI;
      lo = t * ln2LO;
    }
    x = hi - lo;
  } else if (hx < 0x3e300000) {
    return 1 + x;
  }
  const t = x * x;
  const c = x - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  if (k === 0) return 1 - ((x * c) / (c - 2) - x);
  const y = 1 - (lo - (x * c) / (2 - c) - hi);
  if (k >= -1021) return withHi(y, hiw(y) + (k << 20));
  return withHi(y, hiw(y) + ((k + 1000) << 20)) * twom1000;
}

const Q1 = -3.33333333333331316428e-2;
const Q2 = 1.58730158725481460165e-3;
const Q3 = -7.93650757867487942473e-5;
const Q4 = 4.00821782732936239552e-6;
const Q5 = -2.01099218183624371326e-7;

export function expm1(x: number): number {
  x = +x;
  let hx = hiw(x);
  const xsb = hx & 0x80000000;
  hx &= 0x7fffffff;
  let hi: number,
    lo: number,
    k = 0,
    c = 0;
  if (hx >= 0x4043687a) {
    // |x| ≥ 56·ln2
    if (hx >= 0x40862e42) {
      if (hx >= 0x7ff00000) {
        if (((hx & 0xfffff) | low(x)) !== 0) return x + x;
        return xsb === 0 ? x : -1;
      }
      if (x > o_threshold) return Infinity;
    }
    if (xsb !== 0) return -1;
  }
  if (hx > 0x3fd62e42) {
    if (hx < 0x3ff0a2b2) {
      if (xsb === 0) {
        hi = x - ln2HI;
        lo = ln2LO;
        k = 1;
      } else {
        hi = x + ln2HI;
        lo = -ln2LO;
        k = -1;
      }
    } else {
      k = (invln2 * x + (xsb === 0 ? 0.5 : -0.5)) | 0;
      const t = k;
      hi = x - t * ln2HI;
      lo = t * ln2LO;
    }
    x = hi - lo;
    c = hi - x - lo;
  } else if (hx < 0x3c900000) {
    return x;
  }
  const hfx = 0.5 * x;
  const hxs = x * hfx;
  const r1 = 1 + hxs * (Q1 + hxs * (Q2 + hxs * (Q3 + hxs * (Q4 + hxs * Q5))));
  let t = 3 - r1 * hfx;
  let e = hxs * ((r1 - t) / (6 - x * t));
  if (k === 0) return x - (x * e - hxs);
  e = x * (e - c) - c;
  e -= hxs;
  if (k === -1) return 0.5 * (x - e) - 0.5;
  if (k === 1) {
    if (x < -0.25) return -2 * (e - (x + 0.5));
    return 1 + 2 * (x - e);
  }
  let y: number;
  if (k <= -2 || k > 56) {
    y = 1 - (e - x);
    y = withHi(y, hiw(y) + (k << 20));
    return y - 1;
  }
  if (k < 20) {
    t = mk(0x3ff00000 - (0x200000 >> k), 0);
    y = t - (e - x);
    y = withHi(y, hiw(y) + (k << 20));
  } else {
    t = mk((0x3ff - k) << 20, 0);
    y = x - (e + t);
    y += 1;
    y = withHi(y, hiw(y) + (k << 20));
  }
  return y;
}

const two54 = 1.80143985094819840000e16;
const Lg1 = 6.666666666666735130e-1;
const Lg2 = 3.999999999940941908e-1;
const Lg3 = 2.857142874366239149e-1;
const Lg4 = 2.222219843214978396e-1;
const Lg5 = 1.818357216161805012e-1;
const Lg6 = 1.531383769920937332e-1;
const Lg7 = 1.479819860511658591e-1;

export function log(x: number): number {
  x = +x;
  let hx = hiw(x);
  const lx = low(x);
  let k = 0;
  if (hx < 0x00100000) {
    if (((hx & 0x7fffffff) | lx) === 0) return -Infinity;
    if (hx < 0) return NaN;
    k -= 54;
    x *= two54;
    hx = hiw(x);
  }
  if (hx >= 0x7ff00000) return x + x;
  k += (hx >> 20) - 1023;
  hx &= 0x000fffff;
  let i = (hx + 0x95f64) & 0x100000;
  x = withHi(x, hx | (i ^ 0x3ff00000));
  k += i >> 20;
  const f = x - 1;
  if ((0x000fffff & (2 + hx)) < 3) {
    // |f| < 2^-20
    if (f === 0) {
      if (k === 0) return 0;
      return k * ln2HI + k * ln2LO;
    }
    const R = f * f * (0.5 - 0.33333333333333333 * f);
    if (k === 0) return f - R;
    return k * ln2HI - (R - k * ln2LO - f);
  }
  const s = f / (2 + f);
  const dk = k;
  const z = s * s;
  i = hx - 0x6147a;
  const w = z * z;
  const j = 0x6b851 - hx;
  const t1 = w * (Lg2 + w * (Lg4 + w * Lg6));
  const t2 = z * (Lg1 + w * (Lg3 + w * (Lg5 + w * Lg7)));
  i |= j;
  const R = t2 + t1;
  if (i > 0) {
    const hfsq = 0.5 * f * f;
    if (k === 0) return f - (hfsq - s * (hfsq + R));
    return dk * ln2HI - (hfsq - (s * (hfsq + R) + dk * ln2LO) - f);
  }
  if (k === 0) return f - s * (f - R);
  return dk * ln2HI - (s * (f - R) - dk * ln2LO - f);
}

export function log1p(x: number): number {
  x = +x;
  const hx = hiw(x);
  const ax = hx & 0x7fffffff;
  let k = 1,
    f = 0,
    hu = 0,
    c = 0;
  if (hx < 0x3fda827a) {
    // x < 0.41422
    if (ax >= 0x3ff00000) return x === -1 ? -Infinity : NaN;
    if (ax < 0x3e200000) {
      if (ax < 0x3c900000) return x;
      return x - x * x * 0.5;
    }
    if (hx > 0 || hx <= (0xbfd2bec3 | 0)) {
      k = 0;
      f = x;
      hu = 1;
    }
  }
  if (hx >= 0x7ff00000) return x + x;
  if (k !== 0) {
    let u: number;
    if (hx < 0x43400000) {
      u = 1 + x;
      hu = hiw(u);
      k = (hu >> 20) - 1023;
      c = k > 0 ? 1 - (u - x) : x - (u - 1);
      c /= u;
    } else {
      u = x;
      hu = hiw(u);
      k = (hu >> 20) - 1023;
      c = 0;
    }
    hu &= 0x000fffff;
    if (hu < 0x6a09e) {
      u = withHi(u, hu | 0x3ff00000);
    } else {
      k += 1;
      u = withHi(u, hu | 0x3fe00000);
      hu = (0x00100000 - hu) >> 2;
    }
    f = u - 1;
  }
  const hfsq = 0.5 * f * f;
  if (hu === 0) {
    if (f === 0) {
      if (k === 0) return 0;
      c += k * ln2LO;
      return k * ln2HI + c;
    }
    const R = hfsq * (1 - 0.66666666666666666 * f);
    if (k === 0) return f - R;
    return k * ln2HI - (R - (k * ln2LO + c) - f);
  }
  const s = f / (2 + f);
  const z = s * s;
  const R = z * (Lg1 + z * (Lg2 + z * (Lg3 + z * (Lg4 + z * (Lg5 + z * (Lg6 + z * Lg7))))));
  if (k === 0) return f - (hfsq - s * (hfsq + R));
  return k * ln2HI - (hfsq - (s * (hfsq + R) + (k * ln2LO + c)) - f);
}

const ivln10 = 4.34294481903251816668e-1;
const log10_2hi = 3.01029995663611771306e-1;
const log10_2lo = 3.69423907715893078616e-13;

export function log10(x: number): number {
  x = +x;
  let hx = hiw(x);
  const lx = low(x);
  let k = 0;
  if (hx < 0x00100000) {
    if (((hx & 0x7fffffff) | lx) === 0) return -Infinity;
    if (hx < 0) return NaN;
    k -= 54;
    x *= two54;
    hx = hiw(x);
  }
  if (hx >= 0x7ff00000) return x + x;
  k += (hx >> 20) - 1023;
  const i = (k >>> 31) & 1;
  hx = (hx & 0x000fffff) | ((0x3ff - i) << 20);
  const y = k + i;
  x = withHi(x, hx);
  const z = y * log10_2lo + ivln10 * log(x);
  return z + y * log10_2hi;
}

const ivln2hi = 1.44269504072144627571e0;
const ivln2lo = 1.67517131648865118353e-10;

/** log2 the way log10 is done: the exponent exactly, the mantissa's log scaled (exact on powers of two). */
export function log2(x: number): number {
  x = +x;
  let hx = hiw(x);
  const lx = low(x);
  let k = 0;
  if (hx < 0x00100000) {
    if (((hx & 0x7fffffff) | lx) === 0) return -Infinity;
    if (hx < 0) return NaN;
    k -= 54;
    x *= two54;
    hx = hiw(x);
  }
  if (hx >= 0x7ff00000) return x + x;
  k += (hx >> 20) - 1023;
  hx &= 0x000fffff;
  // (the mantissa in [√2/2, √2), as log() does: no cancellation between k and its log just under 1)
  const i = (hx + 0x95f64) & 0x100000;
  x = withHi(x, hx | (i ^ 0x3ff00000));
  k += i >> 20;
  if (x === 1) return k;
  const l = log(x);
  return k + (l * ivln2lo + l * ivln2hi);
}

// ---- pow -------------------------------------------------------------------------------------------

const bp = [1, 1.5];
const dp_h = [0, 5.84962487220764160156e-1];
const dp_l = [0, 1.35003920212974897128e-8];
const two53 = 9007199254740992;
const L1 = 5.99999999999994648725e-1;
const L2 = 4.28571428578550184252e-1;
const L3 = 3.33333329818377432918e-1;
const L4 = 2.72728123808534006489e-1;
const L5 = 2.30660745775561754067e-1;
const L6 = 2.06975017800338417784e-1;
const lg2 = 6.93147180559945286227e-1;
const lg2_h = 6.93147182464599609375e-1;
const lg2_l = -1.90465429995776804525e-9;
const ovt = 8.0085662595372944372e-17;
const cp = 9.61796693925975554329e-1;
const cp_h = 9.61796700954437255859e-1;
const cp_l = -7.02846165095275826516e-9;
const ivln2 = 1.44269504088896338700e0;
const ivln2_h = 1.44269502162933349609e0;
const ivln2_l = 1.92596299112661746887e-8;
const huge = 1e300;
const tiny = 1e-300;

/** z·2^n, rounded once while 2^n is a normal double. */
function scalbn(z: number, n: number) {
  if (n > 1023) return z * 8.98846567431158e307 * mk((n - 1023 + 0x3ff) << 20, 0);
  if (n < -1022) return z * 2.2250738585072014e-308 * mk((n + 1022 + 0x3ff) << 20, 0);
  return z * mk((n + 0x3ff) << 20, 0);
}

export function pow(x: number, y: number): number {
  x = +x;
  y = +y;
  let z: number, ax: number, z_h: number, z_l: number, p_h: number, p_l: number;
  let t1: number, t2: number, r: number, s: number, t: number, u: number, v: number, w: number;
  let i: number, j: number, k: number, n: number;
  const hx = hiw(x);
  const lx = low(x);
  const hy = hiw(y);
  const ly = low(y);
  let ix = hx & 0x7fffffff;
  const iy = hy & 0x7fffffff;
  if ((iy | ly) === 0) return 1;
  if (x !== x || y !== y) return NaN;
  // is y an odd (1) or even (2) integer, or not one (0), when x < 0
  let yisint = 0;
  if (hx < 0) {
    if (iy >= 0x43400000) yisint = 2;
    else if (iy >= 0x3ff00000) {
      k = (iy >> 20) - 0x3ff;
      if (k > 20) {
        j = ly >>> (52 - k);
        if ((j << (52 - k)) >>> 0 === ly) yisint = 2 - (j & 1);
      } else if (ly === 0) {
        j = iy >> (20 - k);
        if (j << (20 - k) === iy) yisint = 2 - (j & 1);
      }
    }
  }
  if (ly === 0) {
    if (iy === 0x7ff00000) {
      // y = ±∞
      if (((ix - 0x3ff00000) | lx) === 0) return NaN;
      if (ix >= 0x3ff00000) return hy >= 0 ? y : 0;
      return hy < 0 ? -y : 0;
    }
    if (iy === 0x3ff00000) return hy < 0 ? 1 / x : x;
    if (hy === 0x40000000) return x * x;
    if (hy === 0x3fe00000 && hx >= 0) return sqrt(x);
  }
  ax = abs(x);
  if (lx === 0 && (ix === 0x7ff00000 || ix === 0 || ix === 0x3ff00000)) {
    z = ax;
    if (hy < 0) z = 1 / z;
    if (hx < 0) {
      if (((ix - 0x3ff00000) | yisint) === 0) z = NaN;
      else if (yisint === 1) z = -z;
    }
    return z;
  }
  n = (hx >> 31) + 1;
  if ((n | yisint) === 0) return NaN;
  s = 1;
  if ((n | (yisint - 1)) === 0) s = -1;
  if (iy > 0x41e00000) {
    // |y| > 2^31
    if (iy > 0x43f00000) {
      if (ix <= 0x3fefffff) return hy < 0 ? huge * huge : tiny * tiny;
      if (ix >= 0x3ff00000) return hy > 0 ? huge * huge : tiny * tiny;
    }
    if (ix < 0x3fefffff) return hy < 0 ? s * huge * huge : s * tiny * tiny;
    if (ix > 0x3ff00000) return hy > 0 ? s * huge * huge : s * tiny * tiny;
    t = ax - 1;
    w = t * t * (0.5 - t * (0.3333333333333333333333 - t * 0.25));
    u = ivln2_h * t;
    v = t * ivln2_l - w * ivln2;
    t1 = lo0(u + v);
    t2 = v - (t1 - u);
  } else {
    n = 0;
    if (ix < 0x00100000) {
      ax *= two53;
      n -= 53;
      ix = hiw(ax);
    }
    n += (ix >> 20) - 0x3ff;
    j = ix & 0x000fffff;
    ix = j | 0x3ff00000;
    if (j <= 0x3988e) k = 0;
    else if (j < 0xbb67a) k = 1;
    else {
      k = 0;
      n += 1;
      ix -= 0x00100000;
    }
    ax = withHi(ax, ix);
    u = ax - bp[k];
    v = 1 / (ax + bp[k]);
    const ss = u * v;
    const s_h = lo0(ss);
    let t_h = mk(((ix >> 1) | 0x20000000) + 0x00080000 + (k << 18), 0);
    let t_l = ax - (t_h - bp[k]);
    const s_l = v * (u - s_h * t_h - s_h * t_l);
    let s2 = ss * ss;
    r = s2 * s2 * (L1 + s2 * (L2 + s2 * (L3 + s2 * (L4 + s2 * (L5 + s2 * L6)))));
    r += s_l * (s_h + ss);
    s2 = s_h * s_h;
    t_h = lo0(3 + s2 + r);
    t_l = r - (t_h - 3 - s2);
    u = s_h * t_h;
    v = s_l * t_h + t_l * ss;
    p_h = lo0(u + v);
    p_l = v - (p_h - u);
    z_h = cp_h * p_h;
    z_l = cp_l * p_h + p_l * cp + dp_l[k];
    t = n;
    t1 = lo0(z_h + z_l + dp_h[k] + t);
    t2 = z_l - (t1 - t - dp_h[k] - z_h);
  }
  // (y1 + y2)·(t1 + t2)
  const y1 = lo0(y);
  p_l = (y - y1) * t1 + y * t2;
  p_h = y1 * t1;
  z = p_l + p_h;
  j = hiw(z);
  i = low(z) | 0;
  if (j >= 0x40900000) {
    if (((j - 0x40900000) | i) !== 0) return s * huge * huge;
    if (p_l + ovt > z - p_h) return s * huge * huge;
  } else if ((j & 0x7fffffff) >= 0x4090cc00) {
    if (((j - (0xc090cc00 | 0)) | i) !== 0) return s * tiny * tiny;
    if (p_l <= z - p_h) return s * tiny * tiny;
  }
  // 2^(p_h + p_l)
  i = j & 0x7fffffff;
  k = (i >> 20) - 0x3ff;
  n = 0;
  if (i > 0x3fe00000) {
    n = j + (0x00100000 >> (k + 1));
    k = ((n & 0x7fffffff) >> 20) - 0x3ff;
    t = mk(n & ~(0x000fffff >> k), 0);
    n = ((n & 0x000fffff) | 0x00100000) >> (20 - k);
    if (j < 0) n = -n;
    p_h -= t;
  }
  t = lo0(p_l + p_h);
  u = t * lg2_h;
  v = (p_l - (t - p_h)) * lg2 + t * lg2_l;
  z = u + v;
  w = v - (z - u);
  t = z * z;
  t1 = z - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  r = (z * t1) / (t1 - 2) - (w + z * w);
  z = 1 - (r - z);
  j = hiw(z);
  j += n << 20;
  if (j >> 20 <= 0) z = scalbn(z, n);
  else z = withHi(z, j);
  return s * z;
}

// ---- the hyperbolic ones, cbrt, hypot ---------------------------------------------------------------

export function sinh(x: number): number {
  x = +x;
  const jx = hiw(x);
  const ix = jx & 0x7fffffff;
  if (ix >= 0x7ff00000) return x + x;
  const h = jx < 0 ? -0.5 : 0.5;
  if (ix < 0x40360000) {
    if (ix < 0x3e300000) return x;
    const t = expm1(abs(x));
    if (ix < 0x3ff00000) return h * (2 * t - (t * t) / (t + 1));
    return h * (t + t / (t + 1));
  }
  if (ix < 0x40862e42) return h * exp(abs(x));
  const lx = low(x);
  if (ix < 0x408633ce || (ix === 0x408633ce && lx <= 0x8fb9f87d)) {
    const w = exp(0.5 * abs(x));
    const t = h * w;
    return t * w;
  }
  return x * 1e307;
}

export function cosh(x: number): number {
  x = +x;
  const ix = hiw(x) & 0x7fffffff;
  if (ix >= 0x7ff00000) return x * x;
  if (ix < 0x3fd62e43) {
    const t = expm1(abs(x));
    const w = 1 + t;
    if (ix < 0x3c800000) return w;
    return 1 + (t * t) / (w + w);
  }
  if (ix < 0x40360000) {
    const t = exp(abs(x));
    return 0.5 * t + 0.5 / t;
  }
  if (ix < 0x40862e42) return 0.5 * exp(abs(x));
  const lx = low(x);
  if (ix < 0x408633ce || (ix === 0x408633ce && lx <= 0x8fb9f87d)) {
    const w = exp(0.5 * abs(x));
    const t = 0.5 * w;
    return t * w;
  }
  return Infinity;
}

export function tanh(x: number): number {
  x = +x;
  const jx = hiw(x);
  const ix = jx & 0x7fffffff;
  if (ix >= 0x7ff00000) return jx >= 0 ? 1 / x + 1 : 1 / x - 1;
  let z: number;
  if (ix < 0x40360000) {
    if (ix < 0x3c800000) return x * (1 + x);
    if (ix >= 0x3ff00000) {
      const t = expm1(2 * abs(x));
      z = 1 - 2 / (t + 2);
    } else {
      const t = expm1(-2 * abs(x));
      z = -t / (t + 2);
    }
  } else z = 1;
  return jx >= 0 ? z : -z;
}

const ln2 = 6.93147180559945286227e-1;

export function asinh(x: number): number {
  x = +x;
  const hx = hiw(x);
  const ix = hx & 0x7fffffff;
  if (ix >= 0x7ff00000) return x + x;
  if (ix < 0x3e300000) return x;
  let w: number;
  if (ix > 0x41b00000) w = log(abs(x)) + ln2;
  else if (ix > 0x40000000) {
    const t = abs(x);
    w = log(2 * t + 1 / (sqrt(x * x + 1) + t));
  } else {
    const t = x * x;
    w = log1p(abs(x) + t / (1 + sqrt(1 + t)));
  }
  return hx > 0 ? w : -w;
}

export function acosh(x: number): number {
  x = +x;
  const hx = hiw(x);
  if (hx < 0x3ff00000) return NaN;
  if (hx >= 0x41b00000) return hx >= 0x7ff00000 ? x + x : log(x) + ln2;
  if (((hx - 0x3ff00000) | low(x)) === 0) return 0;
  if (hx > 0x40000000) return log(2 * x - 1 / (x + sqrt(x * x - 1)));
  const t = x - 1;
  return log1p(t + sqrt(2 * t + t * t));
}

export function atanh(x: number): number {
  x = +x;
  const hx = hiw(x);
  const ix = hx & 0x7fffffff;
  if (x !== x) return x;
  if (ix > 0x3ff00000 || (ix === 0x3ff00000 && low(x) !== 0)) return NaN;
  if (ix === 0x3ff00000) return x > 0 ? Infinity : -Infinity;
  if (ix < 0x3e300000) return x;
  const a = abs(x);
  let t: number;
  if (ix < 0x3fe00000) {
    t = a + a;
    t = 0.5 * log1p(t + (t * a) / (1 - a));
  } else t = 0.5 * log1p((a + a) / (1 - a));
  return hx >= 0 ? t : -t;
}

const B1 = 715094163;
const B2 = 696219795;
const CC = 5.42857142857142815906e-1;
const CD = -7.05306122448979611050e-1;
const CE = 1.41428571428571436819e0;
const CF = 1.60714285714285720630e0;
const CG = 3.57142857142857150787e-1;

export function cbrt(x: number): number {
  x = +x;
  let hx = hiw(x);
  const sign = hx & 0x80000000;
  hx ^= sign;
  if (hx >= 0x7ff00000) return x + x;
  if ((hx | low(x)) === 0) return x;
  x = withHi(x, hx);
  let t: number;
  if (hx < 0x00100000) {
    t = mk(0x43500000, 0) * x;
    t = withHi(t, ((hiw(t) / 3) | 0) + B2);
  } else t = mk(((hx / 3) | 0) + B1, 0);
  let r = (t * t) / x;
  let s = CC + r * t;
  t *= CG + CF / (s + CE + CD / s);
  t = mk(hiw(t) + 1, 0);
  s = t * t;
  r = x / s;
  const w = t + t;
  r = (r - t) / (w + r);
  t = t + t * r;
  return withHi(t, hiw(t) | sign);
}

/** √(Σ x²), scaled so it neither overflows nor underflows; ±∞ anywhere wins over NaN, as the spec says. */
export function hypot(a?: number, b?: number, c?: number): number {
  const n = arguments.length;
  if (n === 2) {
    const x = abs(+a!),
      y = abs(+b!);
    if (x === Infinity || y === Infinity) return Infinity;
    if (x !== x || y !== y) return NaN;
    const m = x > y ? x : y;
    if (m === 0) return 0;
    if (m > 1e150 || m < 1e-150) {
      const xs = x / m,
        ys = y / m;
      return m * sqrt(xs * xs + ys * ys);
    }
    return sqrt(x * x + y * y);
  }
  if (n === 3) {
    const x = abs(+a!),
      y = abs(+b!),
      z = abs(+c!);
    if (x === Infinity || y === Infinity || z === Infinity) return Infinity;
    if (x !== x || y !== y || z !== z) return NaN;
    const m = Math.max(x, y, z);
    if (m === 0) return 0;
    if (m > 1e150 || m < 1e-150) {
      const xs = x / m,
        ys = y / m,
        zs = z / m;
      return m * sqrt(xs * xs + ys * ys + zs * zs);
    }
    return sqrt(x * x + y * y + z * z);
  }
  const v: number[] = [];
  for (let i = 0; i < n; i++) v.push(abs(+arguments[i]));
  if (v.some((q) => q === Infinity)) return Infinity;
  if (v.some((q) => q !== q)) return NaN;
  const m = v.reduce((p, q) => (q > p ? q : p), 0);
  if (m === 0) return 0;
  let sum = 0;
  for (const q of v) sum += (q / m) * (q / m);
  return m * sqrt(sum);
}

// ---- the sim's environment -------------------------------------------------------------------------

/** Every Math function an engine may round its own way, with its deterministic stand-in. */
export const DET_MATH = { sin, cos, tan, asin, acos, atan, atan2, exp, expm1, log, log1p, log2, log10, pow, hypot, sinh, cosh, tanh, asinh, acosh, atanh, cbrt };
type MathKey = keyof typeof DET_MATH;
const KEYS = Object.keys(DET_MATH) as MathKey[];

const M = Math as unknown as Record<string, unknown>;
const NATIVE_MATH: Record<string, unknown> = {};
for (const k of KEYS) NATIVE_MATH[k] = M[k];
const nativeRandom = Math.random;
const nativeDateNow = Date.now;
const perf: { now(): number } | null = typeof performance !== "undefined" ? performance : null;
const nativePerfNow = perf ? perf.now : null;

/** A 32-bit mix (murmur3's finaliser): the per-tick seed of Math.random. */
function mix32(h: number) {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

let rs = 1;
/** The sim's Math.random: mulberry32, reseeded every tick (so a stray call cannot shift later ticks). */
function simRandom() {
  rs = (rs + 0x6d2b79f5) >>> 0;
  let t = rs;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
let simMs = 0;
/** A fixed epoch for the sim's Date.now (the same on every client). */
const EPOCH = 1_700_000_000_000;
const simPerfNow = () => simMs;
const simDateNow = () => EPOCH + Math.floor(simMs);

let on = false;
let quiet = false;
/** Off: the sim runs on the native functions (the bench's cross-engine control run shows why not). */
let enabled = true;

function install() {
  for (const k of KEYS) M[k] = DET_MATH[k];
  Math.random = simRandom;
  Date.now = simDateNow;
  if (perf) perf.now = simPerfNow;
}
function restore() {
  for (const k of KEYS) M[k] = NATIVE_MATH[k];
  Math.random = nativeRandom;
  Date.now = nativeDateNow;
  if (perf && nativePerfNow) perf.now = nativePerfNow;
}

/**
 * The deterministic environment a lockstep tick runs in. While it is on, Math's transcendental
 * functions are the ports above, Math.random is a stream seeded from the room's seed and the tick,
 * and performance.now() / Date.now() read the sim's clock (the tick × 1000/60 ms).
 */
export const Det = {
  /** Inside a sim tick. */
  get active() {
    return on;
  },
  /** Inside the tick of a sim nobody watches (a test's or the bench's second client): no sound. */
  get quiet() {
    return on && quiet;
  },
  /** Run `f` as tick `tick` of the sim seeded `seed` (tick −1: its make()). */
  run<R>(seed: number, tick: number, f: () => R, mute = false): R {
    if (on) return f();
    rs = mix32((seed ^ Math.imul(tick + 1, 0x9e3779b1)) >>> 0) || 1;
    simMs = Math.max(0, tick) * (1000 / 60);
    on = true;
    quiet = mute;
    if (enabled) install();
    try {
      return f();
    } finally {
      on = false;
      quiet = false;
      if (enabled) restore();
    }
  },
  /** Run `f` on the native functions from inside a tick: what only this screen sees or hears. */
  free<R>(f: () => R): R {
    if (!on || !enabled) return f();
    restore();
    try {
      return f();
    } finally {
      install();
    }
  },
  /** Turn the patches off (true) or back on: the cross-engine control run. */
  native(off: boolean) {
    enabled = !off;
  },
};
