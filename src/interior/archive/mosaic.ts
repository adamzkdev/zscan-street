import * as THREE from "three";
import { KIND_LABEL, type Tx, type TxKind } from "../../data/types";
import { KIND_COLOR } from "../../scene/snark";
import { fitText } from "../../scene/fit";
import { canvasTex, makeCanvas, MONO } from "../factory/canvas";
import { NODE_LABEL, zecText, type ArchiveTx } from "./money";

/** Side of the square block (metres) and the most tiles it can hold. */
const SIDE = 4.4;
/** Tile area per √ZEC (m²): 1 ZEC ≈ a 35 cm tile, 100 ZEC ≈ 1.1 m, 10,000 ZEC ≈ 3.5 m. */
const AREA_K = 0.12;
const MAX = 3000;
/** How long a tile flies, and the window over which the whole block arrives (seconds). */
const FLY = 1.1;
const SPREAD = 2.4;
/** Pending transactions floating next to the block, at most. */
const CLOUD = 80;

/** A transaction's value for its tile: the biggest amount it moved, or null when hidden. */
export function valueOf(x: ArchiveTx): number | null {
  const known = x.moves.map((m) => m.zat).filter((z): z is number => z !== null && z > 0);
  return known.length ? Math.max(...known) : null;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Squarified treemap (Bruls, Huizing, van Wijk): areas in, rectangles as close to squares as
 * possible out, laid row by row along the shorter side of what is left.
 */
function squarify(areas: number[], box: Rect): Rect[] {
  const out: Rect[] = new Array(areas.length);
  let rect = { ...box };
  let i = 0;
  const worst = (row: number[], side: number) => {
    const s = row.reduce((a, b) => a + b, 0);
    const mx = Math.max(...row),
      mn = Math.min(...row);
    return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
  };
  while (i < areas.length) {
    const side = Math.min(rect.w, rect.h);
    const row = [areas[i]];
    let j = i + 1;
    while (j < areas.length && worst([...row, areas[j]], side) <= worst(row, side)) row.push(areas[j++]);
    const sum = row.reduce((a, b) => a + b, 0);
    const thick = sum / side;
    let off = 0;
    row.forEach((a, k) => {
      const len = a / thick;
      out[i + k] = rect.w >= rect.h ? { x: rect.x, y: rect.y + off, w: thick, h: len } : { x: rect.x + off, y: rect.y, w: len, h: thick };
      off += len;
    });
    if (rect.w >= rect.h) rect = { x: rect.x + thick, y: rect.y, w: rect.w - thick, h: rect.h };
    else rect = { x: rect.x, y: rect.y + thick, w: rect.w, h: rect.h - thick };
    i = j;
  }
  return out;
}

const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);

/**
 * The block as a mosaic, the way Bitfeed draws Bitcoin: one tile per transaction, its area
 * following the value it moved (square-root scale, so small payments stay visible), its colour
 * its kind, its relief its weight. A new block's tiles fly in from the pending cloud beside it
 * and snap into a squarified layout; the old block's tiles scatter away. The biggest tiles carry
 * their amount, written on a glass plate laid over the mosaic once it has settled. While the
 * archive follows the chain live, the mempool's pending transactions float next to the block,
 * waiting for the next one.
 */
export class Mosaic {
  readonly group = new THREE.Group();
  readonly tiles: THREE.InstancedMesh;
  readonly cloud: THREE.InstancedMesh;
  txs: ArchiveTx[] = [];
  private target = new Float32Array(MAX * 6);
  private from = new Float32Array(MAX * 3);
  private start = 0;
  private gap = 0;
  private animating = false;
  private labels: { mesh: THREE.Mesh; g: CanvasRenderingContext2D; tex: THREE.CanvasTexture };
  private labelsAt = Infinity;
  /** Pending txs in the cloud, by slot. */
  private pending: Tx[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  /** Where the cloud of pending transactions floats (local), and where scattered tiles go. */
  private cloudAt = new THREE.Vector3(-4.2, 2.6, 1.2);

  constructor(
    parent: THREE.Object3D,
    at: THREE.Vector3,
  ) {
    this.group.position.copy(at);
    parent.add(this.group);
    const glow = (mat: THREE.MeshStandardMaterial) => {
      mat.onBeforeCompile = (sh) => {
        sh.fragmentShader = sh.fragmentShader.replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\n  totalEmissiveRadiance += vColor.rgb * 0.45;\n#endif");
      };
      return mat;
    };
    // each tile: a bright rim around a deeper face, tinted by its instance colour
    this.tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), glow(new THREE.MeshStandardMaterial({ map: tileTexture(), roughness: 0.4, metalness: 0.05 })), MAX);
    this.tiles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.tiles.setColorAt(0, this.c.set("#fff"));
    this.tiles.count = 0;
    this.tiles.frustumCulled = false;
    this.group.add(this.tiles);
    this.cloud = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), glow(new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.1 })), CLOUD);
    this.cloud.setColorAt(0, this.c.set("#fff"));
    this.cloud.count = 0;
    this.cloud.frustumCulled = false;
    this.group.add(this.cloud);
    // backboard and a glowing frame
    const back = new THREE.Mesh(new THREE.BoxGeometry(SIDE + 0.3, SIDE + 0.3, 0.12), new THREE.MeshStandardMaterial({ color: "#0b0a12", roughness: 0.6, metalness: 0.3 }));
    back.position.set(0, SIDE / 2, -0.08);
    this.group.add(back);
    const gold = new THREE.MeshBasicMaterial({ color: new THREE.Color("#f4b728").multiplyScalar(1.5), toneMapped: false });
    for (const [w, h, x, y] of [
      [SIDE + 0.36, 0.06, 0, SIDE + 0.15],
      [SIDE + 0.36, 0.06, 0, -0.15],
      [0.06, SIDE + 0.36, -SIDE / 2 - 0.15, SIDE / 2],
      [0.06, SIDE + 0.36, SIDE / 2 + 0.15, SIDE / 2],
    ]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), gold);
      b.position.set(x, y, 0);
      this.group.add(b);
    }
    // the plate of amounts over the tiles
    const { c, g } = makeCanvas(2048, 2048);
    const tex = canvasTex(c);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(SIDE, SIDE), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0 }));
    mesh.position.set(0, SIDE / 2, 0.62);
    mesh.renderOrder = 2;
    this.group.add(mesh);
    this.labels = { mesh, g, tex };
  }

  /** Lay out a block; its tiles start flying at time `t` (seconds). */
  set(txs: ArchiveTx[], t: number) {
    // where each tile flies from: the cloud for the pending ones we were showing, else the cloud's area
    const fromCloud = new Map<string, THREE.Vector3>();
    this.pending.forEach((p, i) => {
      if (i >= this.cloud.count) return;
      this.cloud.getMatrixAt(i, this.m);
      fromCloud.set(p.txid, new THREE.Vector3().setFromMatrixPosition(this.m));
    });
    this.txs = txs.slice(0, MAX);
    const vals = this.txs.map(valueOf);
    const known = vals.filter((v): v is number => v !== null).sort((a, b) => a - b);
    // a hidden amount still needs a tile: a modest one (the median of what we can see, halved)
    const hidden = known.length ? known[Math.floor(known.length / 2)] / 2 : 1e7;
    // absolute sizes, as Bitfeed does: the square is the block's room, a small block is a small
    // cluster in its corner; only a block too big for the square is scaled down to fit
    const weights = vals.map((v) => Math.max(0.02, AREA_K * Math.sqrt(Math.max(1e6, v ?? hidden) / 1e8)));
    // biggest first: the treemap reads from the top-left corner
    const order = weights.map((w, i) => i).sort((a, b) => weights[b] - weights[a]);
    this.txs = order.map((i) => this.txs[i]);
    const ws = order.map((i) => weights[i]);
    const total = ws.reduce((a, b) => a + b, 0) || 1;
    // the tiles fill a square of their own total area, from the bottom-left corner up
    const fill = Math.min(SIDE, Math.sqrt(total * 1.04));
    const k = (fill * fill) / total;
    const rects = squarify(
      ws.map((w) => w * k),
      { x: -SIDE / 2, y: SIDE - fill, w: fill, h: fill },
    );
    const maxW = Math.max(...ws);
    this.txs.forEach((x, i) => {
      const r = rects[i];
      const gap = Math.min(0.06, Math.min(r.w, r.h) * 0.12);
      const depth = 0.12 + 0.42 * (ws[i] / maxW);
      const o = i * 6;
      // canvas-style rects: y grows downward from the top of the square
      this.target.set([r.x + r.w / 2, SIDE - (r.y + r.h / 2), depth / 2, Math.max(0.01, r.w - gap), Math.max(0.01, r.h - gap), depth], o);
      const src = fromCloud.get(x.row.txid) ?? new THREE.Vector3(this.cloudAt.x + (Math.random() - 0.5) * 2, this.cloudAt.y + (Math.random() - 0.5) * 2.4, this.cloudAt.z + Math.random());
      this.from.set([src.x, src.y, src.z], i * 3);
      const k = x.row.kind as TxKind;
      this.c.set(KIND_COLOR[k] ?? "#cccccc").multiplyScalar(0.92 + ((parseInt(x.row.txid.slice(0, 2), 16) || 0) / 255) * 0.2);
      this.tiles.setColorAt(i, this.c);
    });
    this.tiles.count = this.txs.length;
    if (this.tiles.instanceColor) this.tiles.instanceColor.needsUpdate = true;
    this.gap = this.txs.length > 1 ? Math.min(0.12, SPREAD / this.txs.length) : 0;
    this.start = t;
    this.animating = true;
    this.labelsAt = t + FLY + this.gap * this.txs.length;
    (this.labels.mesh.material as THREE.MeshBasicMaterial).opacity = 0;
    this.drawLabels(rects);
    // those now in the block leave the cloud
    const mined = new Set(this.txs.map((x) => x.row.txid));
    this.pending = this.pending.filter((p) => !mined.has(p.txid));
    this.update(t);
  }

  /** The pending transactions to float beside the block (empty when not following the tip). */
  setPending(txs: Tx[]) {
    this.pending = txs.slice(-CLOUD);
    this.cloud.count = this.pending.length;
    this.pending.forEach((p, i) => this.cloud.setColorAt(i, this.c.set(KIND_COLOR[p.kind] ?? "#ccc")));
    if (this.cloud.instanceColor) this.cloud.instanceColor.needsUpdate = true;
  }

  update(t: number) {
    // the pending cloud bobs gently
    for (let i = 0; i < this.cloud.count; i++) {
      const a = i * 2.399;
      const r = 0.25 + Math.sqrt(i) * 0.22;
      this.p.set(this.cloudAt.x + Math.cos(a) * r * 0.8, this.cloudAt.y + Math.sin(a) * r + Math.sin(t * 1.3 + i) * 0.06, this.cloudAt.z + Math.sin(a * 1.7) * 0.3);
      this.s.setScalar(0.16);
      this.q.setFromEuler(new THREE.Euler(0, t * 0.6 + i, 0));
      this.m.compose(this.p, this.q, this.s);
      this.cloud.setMatrixAt(i, this.m);
    }
    this.cloud.instanceMatrix.needsUpdate = true;
    this.q.identity();
    if (this.animating) {
      let flying = false;
      for (let i = 0; i < this.tiles.count; i++) {
        const o = i * 6;
        const k = THREE.MathUtils.clamp((t - this.start - i * this.gap) / FLY, 0, 1);
        if (k < 1) flying = true;
        const e = easeOut(k);
        const fx = this.from[i * 3],
          fy = this.from[i * 3 + 1],
          fz = this.from[i * 3 + 2];
        // an arc: out toward the viewer, then back onto the wall
        this.p.set(fx + (this.target[o] - fx) * e, fy + (this.target[o + 1] - fy) * e, fz + (this.target[o + 2] - fz) * e + Math.sin(e * Math.PI) * 1.2);
        // small in flight, a little pop as it lands
        const pop = k < 1 ? 0.25 + 0.75 * e : 1;
        const land = k >= 1 ? 1 : 1 + Math.max(0, (e - 0.85) / 0.15) * 0.08;
        this.s.set(this.target[o + 3] * pop * land, this.target[o + 4] * pop * land, this.target[o + 5]);
        if (k === 0) this.s.setScalar(0);
        this.m.compose(this.p, this.q, this.s);
        this.tiles.setMatrixAt(i, this.m);
      }
      this.tiles.instanceMatrix.needsUpdate = true;
      if (!flying) {
        this.animating = false;
        this.tiles.boundingBox = null;
        this.tiles.computeBoundingSphere();
      }
    }
    // the amounts fade in once everything has landed
    const mat = this.labels.mesh.material as THREE.MeshBasicMaterial;
    mat.opacity = THREE.MathUtils.clamp((t - this.labelsAt) / 0.6, 0, 1);
  }

  /** The transaction under a hit on the mosaic. */
  at(hit: THREE.Intersection): ArchiveTx | null {
    return hit.object === this.tiles && hit.instanceId !== undefined ? (this.txs[hit.instanceId] ?? null) : null;
  }

  pendingAt(hit: THREE.Intersection): Tx | null {
    return hit.object === this.cloud && hit.instanceId !== undefined ? (this.pending[hit.instanceId] ?? null) : null;
  }

  private drawLabels(rects: Rect[]) {
    const { g, tex } = this.labels;
    const px = 2048 / SIDE;
    g.clearRect(0, 0, 2048, 2048);
    g.textAlign = "center";
    g.textBaseline = "middle";
    this.txs.forEach((x, i) => {
      const r = rects[i];
      const w = r.w * px,
        h = r.h * px;
      if (Math.min(w, h) < 90) return;
      const cx = (r.x + SIDE / 2 + r.w / 2) * px,
        cy = (r.y + r.h / 2) * px;
      const v = valueOf(x);
      const big = Math.min(w / 6.5, h / 3, 150);
      g.fillStyle = "rgba(10,10,16,0.92)";
      g.font = MONO(big, 800);
      fitText(g, v ? `${zecText(v)}` : "🔒", cx, cy - big * 0.32, w * 0.9);
      if (h > 150) {
        g.font = MONO(Math.max(18, big * 0.36), 700);
        g.fillStyle = "rgba(10,10,16,0.78)";
        const main = x.moves.find((m) => m.zat === v) ?? x.moves[0];
        const where = main && main.from !== main.to ? `${NODE_LABEL[main.from].toLowerCase()} → ${NODE_LABEL[main.to].toLowerCase()}` : KIND_LABEL[x.row.kind].toLowerCase();
        fitText(g, `${v ? "ZEC · " : "hidden · "}${where}`, cx, cy + big * 0.48, w * 0.9);
      }
      g.shadowBlur = 0;
    });
    tex.needsUpdate = true;
  }
}

/** Tile face: a light rim and a deeper centre (the instance colour tints both). */
function tileTexture() {
  const { c, g } = makeCanvas(64, 64);
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = "#cfcfcf";
  g.fillRect(4, 4, 56, 56);
  const grad = g.createLinearGradient(0, 4, 0, 60);
  grad.addColorStop(0, "rgba(255,255,255,0.25)");
  grad.addColorStop(1, "rgba(0,0,0,0.06)");
  g.fillStyle = grad;
  g.fillRect(4, 4, 56, 56);
  const t = canvasTex(c);
  t.magFilter = THREE.LinearFilter;
  return t;
}
