import * as THREE from "three";
import { canvasTex } from "./kit";
import { SANS } from "./parts";
import { pad2, type PApp, type Purge } from "./purge";

/**
 * LA FUSION: the explorer's fusion view as a sculpture of floating pixels. The 26 zkSNARKs purged
 * for an Apparition hang in a ring, shatter, and every one of their pixels spirals in; the pixel
 * of the nearest colour lands on each pixel of the Apparition, the rest are absorbed. Then the
 * next one, through all 26. The whole piece turns to face the visitor.
 */

const PIX = 26;
const SIDE = 3.4;
const PA = SIDE / PIX;
const RX = 5.6,
  RY = 2.9;
const SS = 0.95;
const PS = SS / PIX;
/** Seconds: snarks appear, shatter, spiral in, the Apparition holds, then it all goes. */
const T = { appear: 0.9, burst: 1.3, burstLen: 0.7, travel: 2.1, spread: 0.9, travelLen: 1.8, hold: 9.6, out: 0.8, cycle: 11 };
const MAX = 26 * PIX * PIX;

interface Built {
  a: PApp;
  n: number;
  start: Float32Array; // x, y
  burst: Float32Array;
  end: Float32Array;
  c0: Float32Array; // r, g, b (0..1)
  c1: Float32Array;
  p: Float32Array; // delay, role, snark index, random
}

function rng(seed: number) {
  let x = (seed * 2654435761) >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

const lit = (p: Uint8ClampedArray, i: number) => p[i * 4] + p[i * 4 + 1] + p[i * 4 + 2] > 60;

export class FusionSculpture {
  readonly group = new THREE.Group();
  readonly hit: THREE.Mesh;
  private mesh: THREE.InstancedMesh;
  private label: THREE.Mesh;
  private labelCanvas: HTMLCanvasElement;
  private px = new Map<number, Uint8ClampedArray>();
  private p: Purge | null = null;
  private idx = 0;
  private cur: Built | null = null;
  private next: Built | null = null;
  private t0 = -1;
  private snarkAt: [number, number][] = [];

  constructor() {
    const geo = new THREE.BoxGeometry(1, 1, 0.45);
    const mat = new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.raycast = () => {};
    this.group.add(this.mesh);
    // the ring's snark squares, top first, clockwise
    for (let k = 0; k < 26; k++) {
      const a = (k / 26) * Math.PI * 2 + Math.PI / 2;
      this.snarkAt.push([Math.cos(a) * RX - SS / 2, Math.sin(a) * RY + SS / 2]);
    }
    const tex = canvasTex(1024, 160, () => {});
    this.labelCanvas = tex.image as HTMLCanvasElement;
    this.label = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.5), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
    this.label.position.set(0, -RY - 1.05, 0.05);
    this.label.raycast = () => {};
    this.group.add(this.label);
    this.hit = new THREE.Mesh(new THREE.BoxGeometry(2 * RX + 1.4, 2 * RY + 2, 2 * RX + 1.4), new THREE.MeshBasicMaterial({ visible: false }));
    this.group.add(this.hit);
  }

  /** The Apparition on show (for the info panel). */
  get current(): PApp | null {
    return this.cur?.a ?? null;
  }

  /** Every picture as 26 × 26 pixels, cut from the collection atlas. */
  load(p: Purge, atlas: CanvasImageSource) {
    const c = document.createElement("canvas");
    c.width = c.height = PIX;
    const g = c.getContext("2d", { willReadFrequently: true })!;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    const cut = (id: number) => {
      g.fillStyle = "#000";
      g.fillRect(0, 0, PIX, PIX);
      g.drawImage(atlas, ((id - 1) % 100) * 32, Math.floor((id - 1) / 100) * 32, 32, 32, 0, 0, PIX, PIX);
      this.px.set(id, g.getImageData(0, 0, PIX, PIX).data);
    };
    for (const a of p.apps) cut(a.item);
    for (const x of p.purged) cut(x.item);
    this.p = p;
    this.cur = this.build(0);
    this.t0 = -1;
  }

  private build(i: number): Built | null {
    const p = this.p;
    if (!p || !p.apps.length) return null;
    const a = p.apps[i % p.apps.length];
    const ps = p.of(a).slice(0, 26);
    const app = this.px.get(a.item);
    if (!app) return null;
    const rand = rng(a.slot);
    const src: [number, number][] = [];
    ps.forEach((x, k) => {
      const q = this.px.get(x.item);
      if (q) for (let j = 0; j < PIX * PIX; j++) if (lit(q, j)) src.push([k, j]);
    });
    const n = src.length;
    const b: Built = { a, n, start: new Float32Array(n * 2), burst: new Float32Array(n * 2), end: new Float32Array(n * 2), c0: new Float32Array(n * 3), c1: new Float32Array(n * 3), p: new Float32Array(n * 4) };
    src.forEach(([k, j], m) => {
      const q = this.px.get(ps[k].item)!;
      const [sx, sy] = this.snarkAt[k];
      const x = sx + ((j % PIX) + 0.5) * PS,
        y = sy - (Math.floor(j / PIX) + 0.5) * PS;
      b.start.set([x, y], m * 2);
      const dx = x - (sx + SS / 2),
        dy = y - (sy - SS / 2);
      const f = 0.6 + rand() * 1.4;
      b.burst.set([dx * f + (rand() - 0.5) * PS * 6, dy * f + (rand() - 0.5) * PS * 6], m * 2);
      b.c0.set([q[j * 4] / 255, q[j * 4 + 1] / 255, q[j * 4 + 2] / 255], m * 3);
      b.c1.set(b.c0.subarray(m * 3, m * 3 + 3), m * 3);
      const r = rand() * SIDE * 0.25,
        an = rand() * Math.PI * 2;
      b.end.set([Math.cos(an) * r, Math.sin(an) * r], m * 2);
      b.p.set([rand() * T.spread, 0, k, rand()], m * 4);
    });
    // nearest colour for every pixel of the Apparition, in a shuffled order
    const targets: number[] = [];
    for (let j = 0; j < PIX * PIX; j++) if (lit(app, j)) targets.push(j);
    for (let j = targets.length - 1; j > 0; j--) {
      const r = Math.floor(rand() * (j + 1));
      [targets[j], targets[r]] = [targets[r], targets[j]];
    }
    const used = new Uint8Array(n);
    for (const t of targets) {
      const r = app[t * 4],
        gg = app[t * 4 + 1],
        bb = app[t * 4 + 2];
      let best = -1,
        bd = Infinity;
      for (let m = 0; m < n; m++) {
        if (used[m]) continue;
        const dr = b.c0[m * 3] * 255 - r,
          dg = b.c0[m * 3 + 1] * 255 - gg,
          db = b.c0[m * 3 + 2] * 255 - bb;
        const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
        if (d < bd) {
          bd = d;
          best = m;
        }
      }
      if (best < 0) break;
      used[best] = 1;
      b.end.set([-SIDE / 2 + ((t % PIX) + 0.5) * PA, SIDE / 2 - (Math.floor(t / PIX) + 0.5) * PA], best * 2);
      b.c1.set([r / 255, gg / 255, bb / 255], best * 3);
      b.p[best * 4 + 1] = 1;
    }
    return b;
  }

  private drawLabel(a: PApp) {
    const g = this.labelCanvas.getContext("2d")!;
    const w = this.labelCanvas.width,
      h = this.labelCanvas.height;
    g.clearRect(0, 0, w, h);
    g.fillStyle = "rgba(10,10,12,0.82)";
    g.beginPath();
    g.roundRect(0, 0, w, h, 24);
    g.fill();
    g.textBaseline = "middle";
    g.fillStyle = "#f4b728";
    g.font = `700 40px ${SANS}`;
    g.fillText("LA FUSION", 44, h / 2);
    g.fillStyle = "#e8eaed";
    g.font = `800 62px ${SANS}`;
    g.fillText(`Apparition ${pad2(a.slot)}`, 330, h / 2 + 2);
    g.fillStyle = "#9aa0a6";
    g.font = `500 36px ${SANS}`;
    g.textAlign = "right";
    g.fillText("26 → 1", w - 44, h / 2);
    g.textAlign = "left";
    ((this.label.material as THREE.MeshBasicMaterial).map as THREE.Texture).needsUpdate = true;
  }

  /** Advance to time t (seconds); `cam`: the visitor's position, to turn the piece toward. */
  update(t: number, cam: THREE.Vector3) {
    const b = this.cur;
    if (!b) return;
    // face the visitor (turn about the vertical only)
    const wp = this.group.parent ? this.group.parent.localToWorld(this.group.position.clone()) : this.group.position;
    this.group.rotation.y = Math.atan2(cam.x - wp.x, cam.z - wp.z);
    if (this.t0 < 0) {
      this.t0 = t;
      this.drawLabel(b.a);
    }
    let s = t - this.t0;
    if (s >= T.cycle) {
      this.idx = (this.idx + 1) % (this.p?.apps.length || 1);
      this.cur = this.next ?? this.build(this.idx);
      this.next = null;
      this.t0 = t;
      s = 0;
      if (this.cur) this.drawLabel(this.cur.a);
      return;
    }
    // the next one is prepared while this one holds
    if (!this.next && s > T.travel + T.spread + T.travelLen + 0.5) this.next = this.build(this.idx + 1);
    const out = 1 - smooth((s - T.hold) / T.out);
    const arr = this.mesh.instanceMatrix.array as Float32Array;
    const col = this.mesh.instanceColor!.array as Float32Array;
    for (let m = 0; m < b.n; m++) {
      const delay = b.p[m * 4],
        role = b.p[m * 4 + 1],
        k = b.p[m * 4 + 2],
        r = b.p[m * 4 + 3];
      const appear = smooth((s - k * 0.025) / T.appear);
      const burst = cubicOut((s - T.burst - r * 0.3) / T.burstLen);
      const travel = smooth((s - T.travel - delay) / T.travelLen);
      const x0 = b.start[m * 2] + b.burst[m * 2] * burst,
        y0 = b.start[m * 2 + 1] + b.burst[m * 2 + 1] * burst;
      const x1 = b.end[m * 2],
        y1 = b.end[m * 2 + 1];
      // a spiral: angle and radius together, plus one whole turn so every pixel lands true
      const ta = Math.atan2(y0, x0),
        tb = Math.atan2(y1, x1);
      let d = tb - ta;
      d -= Math.PI * 2 * Math.floor((d + Math.PI) / (Math.PI * 2));
      d += Math.PI * 2;
      const ang = ta + d * travel;
      const ra = Math.hypot(x0, y0),
        rad = ra + (Math.hypot(x1, y1) - ra) * travel;
      const x = Math.cos(ang) * rad,
        y = Math.sin(ang) * rad;
      let size = role > 0.5 ? PS + (PA - PS) * travel : PS * (1 - travel);
      size *= appear * out;
      const o = m * 16;
      arr[o] = size;
      arr[o + 1] = 0;
      arr[o + 2] = 0;
      arr[o + 3] = 0;
      arr[o + 4] = 0;
      arr[o + 5] = size;
      arr[o + 6] = 0;
      arr[o + 7] = 0;
      arr[o + 8] = 0;
      arr[o + 9] = 0;
      arr[o + 10] = size;
      arr[o + 11] = 0;
      arr[o + 12] = x;
      arr[o + 13] = y;
      arr[o + 14] = Math.sin(ang * 3 + r * 6) * 0.25 * (1 - travel) * burst;
      arr[o + 15] = 1;
      const mix = role > 0.5 ? smooth((travel - 0.6) / 0.4) : 0;
      for (let c = 0; c < 3; c++) col[m * 3 + c] = b.c0[m * 3 + c] + (b.c1[m * 3 + c] - b.c0[m * 3 + c]) * mix;
    }
    this.mesh.count = b.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
  }
}

const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const cubicOut = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 - (1 - t) ** 3);
