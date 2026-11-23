import * as THREE from "three";
import { FieldBuilder } from "../scene/swing/field";

/**
 * The street's solid shape for the game (src/gta), taken from what is drawn: the whole city seen
 * from straight above through a thin slab of height (from under the water to just over a head),
 * each pixel the highest surface inside it. So every wall, post, step, kerb, statue and stall
 * that you can see stops you where you see it (no invisible walls, no walking through a landmark
 * the plan did not list), and the water is a hole. Built once the game starts (a second time when
 * the far city has streamed in), read back without a stall, decoded over a few frames.
 *
 *  - on foot: a step up of a few tens of centimetres is climbed (stairs, kerbs, plazas); more is a wall;
 *  - at the wheel: a signed distance to the nearest thing a car cannot drive over, its gradient
 *    pushing the car's circles out;
 *  - the camera: what reaches the top of the slab is a wall.
 */

/** The slab: from under the river bed to over a head (world metres). */
const LOW = -3.5;
const HIGH = 2.4;
/** On foot: what a step climbs. */
export const STEP = 0.48;
/** At the wheel: over the road's own surface, this stops a car. */
const CURB_CAR = 0.45;
/** Under this (or nothing at all drawn): water, a hole. */
const HOLE = -0.35;

export interface SolidHost {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  area: { x0: number; x1: number; z0: number; z1: number };
  /** What moves (left out of the picture). */
  movers(): THREE.Object3D[];
  /** The road's own height at (x, z) (0 on the asphalt, the kerb's elsewhere). */
  surface(x: number, z: number): number;
}

export class StreetSolid {
  ready = false;
  private builder: FieldBuilder;
  private size: number;
  private x0 = 0;
  private z0 = 0;
  private cell = 1;
  /** The highest surface in the slab per pixel (NaN: nothing). */
  private top: Float32Array | null = null;
  /** Signed distance (m) to what stops a car: + outside, − inside. */
  private sdf: Float32Array | null = null;
  private building = false;

  constructor(private host: SolidHost) {
    // a phone: a coarser picture (half the memory, a quarter of the work)
    const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
    this.size = coarse ? 1024 : 2048;
    this.builder = new FieldBuilder(host.renderer, host.scene, host.area, () => host.movers(), { size: this.size, band: [LOW, HIGH], empty: NaN, shear: 0.16 });
  }

  /** Make it (or make it again): what moves is noted now and left out a second later. */
  async build() {
    if (this.building) return;
    this.building = true;
    try {
      this.builder.watch();
      await wait(900);
      const f = await this.builder.prepare();
      // (prepare() caches its promise: a later build must draw again)
      (this.builder as unknown as { pending: unknown }).pending = null;
      this.x0 = f.x0;
      this.z0 = f.z0;
      this.cell = f.cell;
      const top = f.h;
      const sdf = await this.distance(top);
      this.top = top;
      this.sdf = sdf;
      this.ready = true;
    } catch (e) {
      console.warn("gta: the street's solid shape could not be built", e);
    } finally {
      this.building = false;
    }
  }

  /** Every cell a car cannot drive on, then the signed distance to them (two chamfer passes each way). */
  private async distance(top: Float32Array) {
    const N = this.size;
    const block = new Uint8Array(N * N);
    for (let j = 0; j < N; j++) {
      const z = this.z0 + (j + 0.5) * this.cell;
      for (let i = 0; i < N; i++) {
        const k = j * N + i;
        const t = top[k];
        const x = this.x0 + (i + 0.5) * this.cell;
        block[k] = t !== t || t < HOLE || t > this.host.surface(x, z) + CURB_CAR ? 1 : 0;
      }
      if ((j & 255) === 255) await frame();
    }
    const outside = await chamfer(block, N, 0);
    const inside = await chamfer(block, N, 1);
    const sdf = new Float32Array(N * N);
    for (let k = 0; k < N * N; k++) sdf[k] = (outside[k] - inside[k]) * this.cell;
    return sdf;
  }

  private index(x: number, z: number) {
    const i = Math.floor((x - this.x0) / this.cell),
      j = Math.floor((z - this.z0) / this.cell);
    if (i < 0 || j < 0 || i >= this.size || j >= this.size) return -1;
    return j * this.size + i;
  }

  /** The highest surface in the slab at (x, z) (NaN: nothing, a hole; undefined: not built). */
  topAt(x: number, z: number): number | undefined {
    if (!this.top) return undefined;
    const k = this.index(x, z);
    return k < 0 ? NaN : this.top[k];
  }

  /**
   * On foot at a floor of `floor`: can a body of radius `r` stand at (x, z)? And the floor there
   * (a step up, a step down, the same).
   */
  foot(x: number, z: number, floor: number, r = 0.28): { ok: boolean; floor: number } {
    if (!this.top) return { ok: true, floor };
    let high = -Infinity;
    for (const [dx, dz] of RING) {
      const t = this.topAt(x + dx * r, z + dz * r)!;
      if (t !== t || t < HOLE) return { ok: false, floor };
      if (t > floor + STEP) return { ok: false, floor };
      high = Math.max(high, t);
    }
    return { ok: true, floor: high };
  }

  /** The signed distance at (x, z), bilinear (m). */
  dist(x: number, z: number) {
    const s = this.sdf;
    if (!s) return Infinity;
    const fx = (x - this.x0) / this.cell - 0.5,
      fz = (z - this.z0) / this.cell - 0.5;
    const i = Math.floor(fx),
      j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= this.size - 1 || j >= this.size - 1) return -1;
    const u = fx - i,
      v = fz - j;
    const N = this.size;
    const a = s[j * N + i],
      b = s[j * N + i + 1],
      c = s[(j + 1) * N + i],
      d = s[(j + 1) * N + i + 1];
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }

  /** Push a car's circle (centre p, radius r) out of what it overlaps, along the distance's slope. */
  resolve(p: THREE.Vector3, r: number) {
    if (!this.sdf) return false;
    const d = this.dist(p.x, p.z);
    if (d >= r) return false;
    const e = this.cell;
    let gx = this.dist(p.x + e, p.z) - this.dist(p.x - e, p.z),
      gz = this.dist(p.x, p.z + e) - this.dist(p.x, p.z - e);
    const l = Math.hypot(gx, gz);
    if (l < 1e-6) return false;
    gx /= l;
    gz /= l;
    p.x += gx * (r - d);
    p.z += gz * (r - d);
    return true;
  }

  /** For the camera: something reaching the top of the slab (a wall, a trunk, a column). */
  wall(x: number, z: number) {
    const t = this.topAt(x, z);
    return t !== undefined && t === t && t > HIGH - 0.15;
  }
}

const RING: [number, number][] = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [0.7, 0.7],
  [-0.7, 0.7],
  [0.7, -0.7],
  [-0.7, -0.7],
];

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => setTimeout(r, 0));

/**
 * Distance (in cells) from every cell whose mask is not `target` to the nearest that is (3-4
 * chamfer, two passes), 0 on the target cells. Yields now and then so the frame goes on.
 */
async function chamfer(mask: Uint8Array, N: number, inside: 0 | 1): Promise<Float32Array> {
  const INF = 1e9;
  const d = new Float32Array(N * N);
  const want = inside ? 0 : 1;
  for (let k = 0; k < N * N; k++) d[k] = mask[k] === want ? 0 : INF;
  const A = 1,
    B = Math.SQRT2;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = j * N + i;
      let v = d[k];
      if (v === 0) continue;
      if (i > 0) v = Math.min(v, d[k - 1] + A);
      if (j > 0) {
        v = Math.min(v, d[k - N] + A);
        if (i > 0) v = Math.min(v, d[k - N - 1] + B);
        if (i < N - 1) v = Math.min(v, d[k - N + 1] + B);
      }
      d[k] = v;
    }
    if ((j & 255) === 255) await frame();
  }
  for (let j = N - 1; j >= 0; j--) {
    for (let i = N - 1; i >= 0; i--) {
      const k = j * N + i;
      let v = d[k];
      if (v === 0) continue;
      if (i < N - 1) v = Math.min(v, d[k + 1] + A);
      if (j < N - 1) {
        v = Math.min(v, d[k + N] + A);
        if (i < N - 1) v = Math.min(v, d[k + N + 1] + B);
        if (i > 0) v = Math.min(v, d[k + N - 1] + B);
      }
      d[k] = v;
    }
    if ((j & 255) === 0) await frame();
  }
  // (the target's own distance 0; a cell next to it about one: centre to edge is half a cell)
  for (let k = 0; k < N * N; k++) if (d[k] > 0) d[k] -= 0.5;
  return d;
}
