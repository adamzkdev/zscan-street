/**
 * A checksum of a sim's state for the desync check (Mini.hash()). Numbers go in rounded to a
 * millionth (so −0 and +0 agree, and the check reads as "same state", not "same last bit"); one
 * client a millionth of a metre off is still caught, a few ticks later, once it has grown.
 */
const F = new Float64Array(1);
const U = new Int32Array(F.buffer);

export class Hasher {
  /** Every bit of every number instead (the tests: the strictest check there is). */
  static exact = false;
  private h = 0x811c9dc5;
  /** An integer (a score, a seat, a flag). */
  int(v: number) {
    let h = this.h ^ (v | 0);
    h = Math.imul(h, 0x01000193);
    h ^= h >>> 15;
    this.h = Math.imul(h, 0x2c1b3c6d);
    return this;
  }
  /** A number rounded to 1e-6 (a position, a velocity, a timer). NaN and ±∞ have their own marks. */
  num(v: number) {
    if (Hasher.exact) {
      F[0] = v;
      return this.int(U[0]).int(U[1]);
    }
    if (v !== v) return this.int(0x7fc00000).int(1);
    if (v === Infinity || v === -Infinity) return this.int(v > 0 ? 0x7ff00000 : -0x100000).int(2);
    const q = Math.round(v * 1e6);
    // (beyond 2^31 millionths, the two halves)
    return this.int(q % 0x80000000).int(Math.floor(q / 0x80000000));
  }
  bool(v: boolean) {
    return this.int(v ? 1 : 0);
  }
  /** The checksum, an unsigned 32-bit number. */
  get value() {
    let h = this.h;
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    return h >>> 0;
  }
}
