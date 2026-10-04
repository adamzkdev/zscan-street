import * as THREE from "three";
import type { BlockSummary } from "../data/types";
import type { ShopSite } from "./city";

/** Boxes per shelf board, boards per run (the site has three runs). */
const PER_BOARD = 11;
const BOARDS = 3;

/**
 * The MEMPOOL shop keeps the chain on its shelves: one box per recent block, newest at the front
 * of the first run. A box's size and colour follow how many transactions it carries; its label is
 * the block height. Boxes are clickable (userData.block).
 */
export class BlockShelf {
  readonly group = new THREE.Group();
  private boxes = new Map<number, THREE.Mesh>();
  private blocks: BlockSummary[] = [];
  private geo = new THREE.BoxGeometry(1, 1, 1);

  constructor(
    parent: THREE.Object3D,
    private site: ShopSite,
  ) {
    parent.add(this.group);
  }

  get capacity() {
    return PER_BOARD * BOARDS * this.site.shelves.length;
  }

  /** Meshes for picking. */
  get meshes() {
    return [...this.boxes.values()];
  }

  set(blocks: BlockSummary[]) {
    this.blocks = [...blocks].sort((a, b) => b.height - a.height).slice(0, this.capacity);
    this.layout();
  }

  push(b: BlockSummary) {
    if (this.blocks.some((x) => x.height === b.height)) return;
    this.set([b, ...this.blocks]);
  }

  private layout() {
    const keep = new Set(this.blocks.map((b) => b.height));
    for (const [h, m] of this.boxes)
      if (!keep.has(h)) {
        this.group.remove(m);
        (m.material as THREE.Material[]).forEach((x) => x.dispose());
        this.boxes.delete(h);
      }
    const max = Math.max(4, ...this.blocks.map((b) => b.tx_count));
    this.blocks.forEach((b, i) => {
      let m = this.boxes.get(b.height);
      if (!m) {
        m = this.box(b, max);
        this.boxes.set(b.height, m);
        this.group.add(m);
      }
      const run = this.site.shelves[Math.floor(i / (PER_BOARD * BOARDS))];
      const k = i % (PER_BOARD * BOARDS);
      const board = BOARDS - 1 - Math.floor(k / PER_BOARD);
      const slot = k % PER_BOARD;
      // newest at the right end of the top board of the front run
      const at = run.b.clone().lerp(run.a, (slot + 0.5) / PER_BOARD);
      at.y += board * run.step + m.scale.y / 2;
      m.position.copy(at);
    });
  }

  private box(b: BlockSummary, max: number) {
    const txs = Math.max(0, b.tx_count - 1);
    const k = Math.min(1, txs / max);
    const s = 0.22 + k * 0.14;
    const mats = [0, 1, 2, 3, 4, 5].map((f) => new THREE.MeshStandardMaterial({ color: txs ? "#f4b728" : "#8a8692", roughness: 0.6, metalness: 0.1, map: f === 4 ? label(b, txs) : null }));
    const m = new THREE.Mesh(this.geo, mats);
    m.scale.set(s, s * 0.9, s * 0.8);
    m.castShadow = true;
    m.userData.block = b;
    return m;
  }
}

/** Front label: the height, and a bar for how full the block was. */
function label(b: BlockSummary, txs: number) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = txs ? "#f4b728" : "#8a8692";
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = "#0d0d0d";
  ctx.fillRect(10, 34, 108, 46);
  ctx.fillStyle = txs ? "#f4b728" : "#d0d0d0";
  ctx.font = '700 30px "JetBrains Mono", monospace';
  ctx.textAlign = "center";
  ctx.fillText(String(b.height % 100000).padStart(5, "0"), 64, 68);
  ctx.fillStyle = "#0d0d0d";
  ctx.font = '700 20px "JetBrains Mono", monospace';
  ctx.fillText(`${txs} TX`, 64, 108);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
