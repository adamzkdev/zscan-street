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
export const STEP = 0.62;
/** At the wheel: over the road's own surface, this stops a car. */
const CURB_CAR = 0.45;
/** Under this (or nothing at all drawn): water, a hole. */
const HOLE = -0.35;

/** At the wheel: anything thinner than this (m) is driven through (a post, a trunk, a rail, a bench). */
const THIN = 2.4;
/** On the asphalt only what stands this tall stops a car (a pillar, a building): never a rail or a low wall. */
const ROAD_TALL = 2.15;

export interface SolidHost {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  area: { x0: number; x1: number; z0: number; z1: number };
  /** What moves (left out of the picture). */
  movers(): THREE.Object3D[];
  /** The road's own height at (x, z) (0 on the asphalt, the kerb's elsewhere). */
  surface(x: number, z: number): number;
  /** On the asphalt. */
  road(x: number, z: number): boolean;
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
  /** What a car hits but goes through (thin things): 1 per cell. */
  private thin: Uint8Array | null = null;
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

  /**
   * What stops a car: every cell over the kerb by more than a car climbs, or a hole; on the asphalt
   * only what stands tall. Then everything thinner than THIN taken out (an opening: eroded, then grown
   * back), so posts, trunks, rails, bollards, benches and low walls are driven through (the game
   * knocks them down) and only buildings, big walls and the water stop it. The signed distance to
   * what is left pushes the car out.
   */
  private async distance(top: Float32Array) {
    const N = this.size;
    const raw = new Uint8Array(N * N);
    for (let j = 0; j < N; j++) {
      const z = this.z0 + (j + 0.5) * this.cell;
      for (let i = 0; i < N; i++) {
        const k = j * N + i;
        const t = top[k];
        const x = this.x0 + (i + 0.5) * this.cell;
        if (t !== t || t < HOLE) raw[k] = 1;
        else if (this.host.road(x, z)) raw[k] = t > ROAD_TALL ? 1 : 0;
        else raw[k] = t > this.host.surface(x, z) + CURB_CAR ? 1 : 0;
      }
      if ((j & 255) === 255) await frame();
    }
    // the small things on their own (a post, a trunk, a bin, a bench: a patch no bigger than THIN
    // across) are driven through; anything bigger (a wall, a building, a long railing) stays
    const block = new Uint8Array(N * N);
    const thin = new Uint8Array(N * N);
    const label = new Int32Array(N * N);
    const stack = new Int32Array(N * N);
    const lim = THIN / this.cell;
    let id = 0;
    for (let k0 = 0; k0 < N * N; k0++) {
      if (!raw[k0] || label[k0]) continue;
      id++;
      let sp = 0;
      stack[sp++] = k0;
      label[k0] = id;
      let i0 = N,
        i1 = -1,
        j0 = N,
        j1 = -1,
        hole = false;
      const members: number[] = [];
      while (sp) {
        const k = stack[--sp];
        members.push(k);
        const i = k % N,
          j = (k / N) | 0;
        if (i < i0) i0 = i;
        if (i > i1) i1 = i;
        if (j < j0) j0 = j;
        if (j > j1) j1 = j;
        const t = top[k];
        if (t !== t || t < HOLE) hole = true;
        for (let dj = -1; dj <= 1; dj++)
          for (let di = -1; di <= 1; di++) {
            const ni = i + di,
              nj = j + dj;
            if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
            const nk = nj * N + ni;
            if (raw[nk] && !label[nk]) {
              label[nk] = id;
              stack[sp++] = nk;
            }
          }
      }
      const small = !hole && i1 - i0 < lim && j1 - j0 < lim;
      for (const k of members) (small ? thin : block)[k] = 1;
      if ((id & 4095) === 0) await frame();
    }
    this.thin = thin;
    const outside = await chamfer(block, N, 0);
    const inside2 = await chamfer(block, N, 1);
    const sdf = new Float32Array(N * N);
    for (let k = 0; k < N * N; k++) sdf[k] = (outside[k] - inside2[k]) * this.cell;
    return sdf;
  }

  /** Something thin a car goes through at (x, z) (a post, a rail): the game knocks it about. */
  thinAt(x: number, z: number) {
    if (!this.thin) return false;
    const k = this.index(x, z);
    return k >= 0 && this.thin[k] === 1;
  }

  /** Can a car be here (for the reachability check)? */
  drivable(x: number, z: number, r = 1) {
    return this.dist(x, z) >= r;
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
