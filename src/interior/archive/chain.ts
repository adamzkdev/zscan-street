import * as THREE from "three";
import { fitText } from "../../scene/fit";
import { canvasTex, makeCanvas, MONO } from "../factory/canvas";

/** Blocks shown either side of the current one. */
export const SPAN = 10;
const N = SPAN * 2 + 1;
const GOLD = new THREE.Color("#f4b728").multiplyScalar(1.6);
/** Blocks after the current one, and before it: neon tubes, cooler for the past. */
const IDLE = new THREE.Color("#4a9aff").multiplyScalar(1.1);
const DONE = new THREE.Color("#2fb8a8").multiplyScalar(0.9);
const tmp = new THREE.Color();

/**
 * The chain along the back wall: a pillar per block from h−10 to h+10, as tall as its transaction
 * count (log scale), the current one lit gold; a LED strip on the floor in front reads the heights.
 * Clicking a pillar loads that block.
 */
export class Chain {
  readonly pillars: THREE.InstancedMesh;
  private strip: { mesh: THREE.Mesh; g: CanvasRenderingContext2D; tex: THREE.CanvasTexture };
  /** Height of each pillar's block, or null where there is none (beyond the tip). */
  heights: (number | null)[] = new Array(N).fill(null);
  private m = new THREE.Matrix4();
  private glow = 0;

  constructor(
    parent: THREE.Object3D,
    private x0: number,
    private x1: number,
    private z: number,
    private y: number,
  ) {
    // unlit: the pillars are light tubes
    const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
    this.pillars = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, N);
    this.pillars.frustumCulled = false;
    for (let i = 0; i < N; i++) this.pillars.setColorAt(i, DONE);
    parent.add(this.pillars);
    // the LED strip on the floor, readable from the room
    const { c, g } = makeCanvas(2048, 96);
    const tex = canvasTex(c);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 + 0.6, ((x1 - x0 + 0.6) * 96) / 2048), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((x0 + x1) / 2, y + 0.012, z + 0.75);
    parent.add(mesh);
    this.strip = { mesh, g, tex };
  }

  private slotX(i: number) {
    return this.x0 + ((this.x1 - this.x0) * i) / (N - 1);
  }

  /** Lay out the pillars around `center`: tx counts where known (missing blocks are left short). */
  set(center: number, tip: number, counts: Map<number, number>) {
    const known = [...counts.values()];
    const max = Math.max(2, ...known);
    for (let i = 0; i < N; i++) {
      const h = center - SPAN + i;
      const real = h >= 0 && h <= tip;
      this.heights[i] = real ? h : null;
      const n = counts.get(h);
      const tall = !real ? 0 : n === undefined ? 0.18 : 0.3 + (2.0 * Math.log(1 + n)) / Math.log(1 + max);
      const w = i === SPAN ? 0.36 : 0.22;
      this.m.compose(new THREE.Vector3(this.slotX(i), this.y + tall / 2, this.z), new THREE.Quaternion(), new THREE.Vector3(real ? w : 0, Math.max(0.001, tall), real ? w : 0));
      this.pillars.setMatrixAt(i, this.m);
      this.pillars.setColorAt(i, i === SPAN ? GOLD : h < center ? DONE : IDLE);
    }
    this.pillars.instanceMatrix.needsUpdate = true;
    if (this.pillars.instanceColor) this.pillars.instanceColor.needsUpdate = true;
    this.pillars.computeBoundingSphere();
    this.drawStrip(center);
  }

  private drawStrip(center: number) {
    const { g, tex } = this.strip;
    g.fillStyle = "#05060a";
    g.fillRect(0, 0, 2048, 96);
    g.textAlign = "center";
    for (let i = 0; i < N; i++) {
      const h = this.heights[i];
      if (h === null) continue;
      const x = 2048 * ((0.3 + (this.slotX(i) - this.x0)) / (this.x1 - this.x0 + 0.6));
      const cur = h === center;
      g.fillStyle = cur ? "#f4b728" : "#7f9ccf";
      g.shadowColor = g.fillStyle;
      g.shadowBlur = cur ? 14 : 0;
      g.font = MONO(cur ? 26 : 19, cur ? 800 : 600);
      fitText(g, String(h), x, 58, 2048 / N - 4);
    }
    g.shadowBlur = 0;
    // the chain itself: a line linking the slots
    g.fillStyle = "#24304a";
    g.fillRect(0, 84, 2048, 4);
    tex.needsUpdate = true;
  }

  /** The block height of a clicked pillar. */
  at(hit: THREE.Intersection): number | null {
    return hit.object === this.pillars && hit.instanceId !== undefined ? this.heights[hit.instanceId] : null;
  }

  /** The current pillar breathes. */
  update(dt: number) {
    this.glow += dt;
    const k = 1.2 + Math.sin(this.glow * 3) * 0.35;
    this.pillars.setColorAt(SPAN, tmp.copy(GOLD).multiplyScalar(k / 1.6));
    if (this.pillars.instanceColor) this.pillars.instanceColor.needsUpdate = true;
  }
}
