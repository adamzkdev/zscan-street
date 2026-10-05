import * as THREE from "three";
import type { BlockTxRow } from "../../data/types";
import { KIND_COLOR } from "../../scene/snark";

/** Most bricks a block can show (the 2 MB sandblasting blocks of 2022 held a few thousand). */
const MAX = 4000;
/** Side of the square the tower stands on (metres) and the tallest it may grow. */
const FOOT = 2.6;
/** Tallest the tower may stand above the plinth (the room is 4.6 m high). */
const MAX_H = 2.4;
/** How far a brick falls before it lands, and how long its fall takes (seconds). */
const DROP = 3.2;
const FALL = 0.5;

/**
 * Bytes → grid cells: about 1.5 kB a cell, so a brick's volume is its size. A payment is a cube,
 * a shielded bundle a bar, and a 2 MB sandblasting transaction (2022) a slab of whole layers.
 */
const CELL_BYTES = 1500;
const cellsFor = (size: number) => Math.max(1, Math.round(size / CELL_BYTES));

const bounce = (p: number) => {
  // ease-out bounce: a fall, a small hop, settle
  const n = 7.5625,
    d = 2.75;
  if (p < 1 / d) return n * p * p;
  if (p < 2 / d) return n * (p -= 1.5 / d) * p + 0.75;
  if (p < 2.5 / d) return n * (p -= 2.25 / d) * p + 0.9375;
  return n * (p -= 2.625 / d) * p + 0.984375;
};

/**
 * A block as a tower of bricks: one brick per transaction, its volume set by the transaction's
 * size, its colour by its kind, the coinbase in gold laid last on top. Bricks are packed in
 * layers on a square base, rows turning a quarter each layer like brickwork. A new block makes
 * the bricks rain down in block order and bounce into place. One InstancedMesh, so a block of
 * thousands of transactions is still a single draw call.
 */
export class Bricks {
  readonly mesh: THREE.InstancedMesh;
  /** Transactions in brick order (the coinbase last), for picking by instance id. */
  txs: BlockTxRow[] = [];
  /** Top of the finished tower (metres above the base), for the light and the label above it. */
  height = 0;
  private targets = new Float32Array(MAX * 6);
  private start = 0;
  private gap = 0;
  private animating = false;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  /** Called as each brick lands (for a click sound), at most once per frame. */
  onLand?: () => void;

  constructor(
    parent: THREE.Object3D,
    private base: THREE.Vector3,
  ) {
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.15 });
    // each brick glows a little in its own colour, like the city's LED signs
    mat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\n  totalEmissiveRadiance += vColor.rgb * 0.28;\n#endif");
    };
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, this.c.set("#ffffff"));
    this.mesh.count = 0;
    // the tower changes size block to block: never culled by a stale bounding sphere
    this.mesh.frustumCulled = false;
    parent.add(this.mesh);
  }

  /** Lay out a new block; the fall starts at time `t` (seconds). */
  set(rows: BlockTxRow[], t: number) {
    // biggest first, so slabs make the foundation and nothing ends up floating over a gap; the
    // coinbase is laid last, on top (the departures board keeps the block's own order)
    const coinbase = rows.filter((r) => r.kind === "coinbase");
    this.txs = [...rows.filter((r) => r.kind !== "coinbase").sort((a, b) => b.size - a.size), ...coinbase].slice(0, MAX);
    const lens = this.txs.map((r) => cellsFor(r.size));
    const cells = lens.reduce((a, b) => a + b, 0);
    // the coarsest grid whose tower fits under MAX_H (rows waste a little at their ends)
    let N = 6;
    for (const n of [6, 8, 10, 12, 16, 20, 24, 32, 40]) {
      N = n;
      if ((Math.ceil((cells * 1.25) / (n * n)) + 1) * (FOOT / n) * 0.62 <= MAX_H) break;
    }
    const cell = FOOT / N,
      layerH = cell * 0.62,
      gap = cell * 0.09;
    let layer = 0,
      row = 0,
      col = 0;
    const o6 = (i: number, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
      const o = i * 6;
      this.targets.set([x, y, z, sx, sy, sz], o);
    };
    this.txs.forEach((r, i) => {
      const len = lens[i];
      if (len > N * N) {
        // whole layers: a slab across the full footprint
        if (row || col) layer++;
        const L = Math.ceil(len / (N * N));
        o6(i, 0, layer * layerH + (L * layerH) / 2, 0, FOOT - gap, L * layerH - gap * 0.6, FOOT - gap);
        layer += L;
        row = col = 0;
      } else if (len > N) {
        // whole rows of this layer
        if (col) {
          col = 0;
          row++;
        }
        const k = Math.ceil(len / N);
        if (row + k > N) {
          row = 0;
          layer++;
        }
        const across = -FOOT / 2 + (row + k / 2) * cell;
        const alongX = layer % 2 === 0;
        o6(i, alongX ? 0 : across, layer * layerH + layerH / 2, alongX ? across : 0, alongX ? FOOT - gap : k * cell - gap, layerH - gap * 0.6, alongX ? k * cell - gap : FOOT - gap);
        row += k;
        if (row >= N) {
          row = 0;
          layer++;
        }
      } else {
        if (col + len > N) {
          col = 0;
          row++;
        }
        if (row >= N) {
          row = 0;
          layer++;
        }
        const along = -FOOT / 2 + (col + len / 2) * cell,
          across = -FOOT / 2 + (row + 0.5) * cell;
        const alongX = layer % 2 === 0;
        o6(i, alongX ? along : across, layer * layerH + layerH / 2, alongX ? across : along, alongX ? len * cell - gap : cell - gap, layerH - gap * 0.6, alongX ? cell - gap : len * cell - gap);
        col += len;
      }
      // block-to-block variety within a kind, so a wall of one colour still reads as bricks
      const k = 0.86 + ((parseInt(r.txid.slice(0, 2), 16) || 0) / 255) * 0.26;
      this.c.set(KIND_COLOR[r.kind] ?? "#cccccc").multiplyScalar(r.kind === "coinbase" ? 1.15 : k);
      this.mesh.setColorAt(i, this.c);
    });
    const used = row || col ? layer + 1 : layer;
    this.height = used * layerH;
    this.mesh.count = this.txs.length;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    // the whole block lands within about three seconds, however many transactions it has
    this.gap = this.txs.length > 1 ? Math.min(0.06, 2.6 / this.txs.length) : 0;
    this.start = t;
    this.animating = true;
    this.update(t);
  }

  update(t: number) {
    if (!this.animating) return;
    let falling = false,
      landed = false;
    for (let i = 0; i < this.txs.length; i++) {
      const o = i * 6;
      const local = t - this.start - i * this.gap;
      if (local < 0) {
        falling = true;
        this.s.set(0, 0, 0);
        this.p.set(0, -50, 0);
      } else {
        const k = Math.min(1, local / FALL);
        if (k < 1) falling = true;
        else if (local - FALL < 0.05) landed = true;
        this.p.set(this.base.x + this.targets[o], this.base.y + this.targets[o + 1] + DROP * (1 - bounce(k)), this.base.z + this.targets[o + 2]);
        this.s.set(this.targets[o + 3], this.targets[o + 4], this.targets[o + 5]);
      }
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (landed) this.onLand?.();
    if (!falling) {
      this.animating = false;
      // picking tests the instances' bounds: refresh them once the tower stands
      this.mesh.boundingBox = null;
      this.mesh.computeBoundingSphere();
    }
  }

  /** The transaction under a raycast hit, if it is one of the bricks. */
  at(hit: THREE.Intersection): BlockTxRow | null {
    return hit.object === this.mesh && hit.instanceId !== undefined ? (this.txs[hit.instanceId] ?? null) : null;
  }
}
