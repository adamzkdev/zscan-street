import * as THREE from "three";
import { get } from "../data/zscan";
import { snarkPixels, type Pixels } from "./drones";

/**
 * The card stunt: one stand of the stadium holds up coloured cards and becomes a 26 × 26 picture,
 * one card a pixel — the Zcash coin, the last zkSNARK sold on Zilk Road, FedosArt's #9593, the
 * Apparition of the day — each flipping into the next column by column, like a real tifo.
 * Every few minutes, for about forty seconds.
 */

const G = 26;
const EVERY = 150;
const RISE = 2.5,
  HOLD = 8,
  FLIP = 2.2;

export interface StandSeat {
  pos: THREE.Vector3;
}

/** The Zcash coin as 26 × 26 pixels: a gold ring, the Z, its bars, on the night. */
function coinPixels(): Pixels {
  const c = document.createElement("canvas");
  c.width = c.height = G * 8;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  const W = G * 8,
    m = W / 2,
    r = W * 0.42;
  g.fillStyle = "#000";
  g.fillRect(0, 0, W, W);
  g.fillStyle = "#f4b728";
  g.beginPath();
  g.arc(m, m, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#1a1408";
  g.lineWidth = W * 0.1;
  g.lineJoin = "miter";
  g.beginPath();
  g.moveTo(m - r * 0.42, m - r * 0.4);
  g.lineTo(m + r * 0.42, m - r * 0.4);
  g.lineTo(m - r * 0.42, m + r * 0.4);
  g.lineTo(m + r * 0.42, m + r * 0.4);
  g.stroke();
  g.fillStyle = "#1a1408";
  g.fillRect(m - W * 0.04, m - r * 0.72, W * 0.08, r * 0.3);
  g.fillRect(m - W * 0.04, m + r * 0.42, W * 0.08, r * 0.3);
  const small = document.createElement("canvas");
  small.width = small.height = G;
  const sg = small.getContext("2d", { willReadFrequently: true })!;
  sg.drawImage(c, 0, 0, G, G);
  const d = sg.getImageData(0, 0, G, G).data;
  const out: Pixels = [];
  for (let i = 0; i < G * G; i++) out.push(d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2] < 40 ? "" : `rgb(${d[i * 4]},${d[i * 4 + 1]},${d[i * 4 + 2]})`);
  return out;
}

export class CardStunt {
  readonly group = new THREE.Group();
  private mesh: THREE.InstancedMesh;
  /** Each card's pixel (index into 26 × 26), base matrix parts. */
  private px: number[] = [];
  private col: number[] = [];
  private base: { p: THREE.Vector3; q: THREE.Quaternion }[] = [];
  private w = 0.6;
  private h = 0.9;
  private pictures: Pixels[] = [];
  private t = -40;
  private loading = false;
  private m4 = new THREE.Matrix4();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  private dark = new THREE.Color("#0b0a10");

  /**
   * `seats`: one stand's seats (world positions); `toPitch`: the horizontal direction the stand
   * faces. The block is the stand's middle, as wide as the stand is deep, so the picture is square.
   */
  constructor(seats: StandSeat[], toPitch: THREE.Vector3) {
    const up = new THREE.Vector3(0, 1, 0);
    const out = toPitch.clone().setY(0).normalize().negate();
    // seen from the pitch, looking out at the stand: its right
    const right = new THREE.Vector3().crossVectors(out, up).normalize();
    const minY = Math.min(...seats.map((s) => s.pos.y));
    const front = Math.min(...seats.map((s) => s.pos.dot(out)));
    // how far up the slope each seat is
    const up2 = seats.map((s) => Math.hypot(s.pos.dot(out) - front, s.pos.y - minY));
    const depth = Math.max(...up2) || 1;
    const along = seats.map((s) => s.pos.dot(right));
    const mid = (Math.min(...along) + Math.max(...along)) / 2;
    const half = depth / 2;
    // the slope's angle, for cards held along it
    const rise = Math.max(...seats.map((s) => s.pos.y)) - minY;
    const run = Math.max(...seats.map((s) => s.pos.dot(out))) - front;
    const tilt = Math.atan2(rise, Math.max(run, 0.1));
    const n = out
      .clone()
      .negate()
      .multiplyScalar(Math.sin(tilt))
      .add(up.clone().multiplyScalar(Math.cos(tilt)))
      .normalize();
    // cards face the pitch and the sky, along the slope; their top up the slope
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right.clone().negate(), new THREE.Vector3().crossVectors(n, right.clone().negate()).normalize(), n));
    seats.forEach((s, i) => {
      const u = (along[i] - (mid - half)) / depth;
      if (u < 0 || u >= 1) return;
      const v = up2[i] / depth;
      const col = Math.min(G - 1, Math.floor((1 - u) * G));
      const row = Math.min(G - 1, Math.floor((1 - v) * G));
      this.px.push(row * G + col);
      this.col.push(col);
      this.base.push({
        p: s.pos
          .clone()
          .add(new THREE.Vector3(0, 1.45, 0))
          .addScaledVector(n, 0.15),
        q: q.clone(),
      });
    });
    // card size from the seat spacing: wide as a seat, deep as a row along the slope
    this.w = Math.max(0.45, (depth / Math.sqrt(Math.max(1, this.base.length))) * 1.05);
    this.h = this.w * 1.25;
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), Math.max(1, this.base.length));
    this.mesh.count = this.base.length;
    this.mesh.frustumCulled = false;
    this.mesh.raycast = () => {};
    for (let i = 0; i < this.base.length; i++) this.mesh.setColorAt(i, this.dark);
    this.group.add(this.mesh);
    this.group.visible = false;
  }

  get size() {
    return this.base.length;
  }

  private async load() {
    this.loading = true;
    try {
      const sale = await get<{ venue_sales?: { item_id: string }[] }>("/v1/collections/zksnarks?tab=sales");
      const ap = await get<{ apparitions: { item: string }[] }>("/v1/collections/zksnarks/apparitions");
      const day = Math.floor(Date.now() / 86_400_000);
      const ids = [sale?.venue_sales?.[0] ? Number(sale.venue_sales[0].item_id) : null, 9593, ap?.apparitions?.length ? Number(ap.apparitions[day % ap.apparitions.length].item) : null].filter(
        (x): x is number => x != null,
      );
      const pics = (await Promise.all(ids.map((id) => snarkPixels(id)))).filter((p): p is Pixels => !!p);
      this.pictures = [coinPixels(), ...pics];
    } finally {
      this.loading = false;
    }
  }

  private paint(i: number, pic: Pixels | undefined) {
    const v = pic?.[this.px[i]];
    if (v) this.c.set(v).multiplyScalar(1.1);
    else this.c.copy(this.dark);
    this.mesh.setColorAt(i, this.c);
  }

  /** Start one now (the films). */
  now() {
    this.t = -0.01;
  }

  update(dt: number, visible: boolean) {
    this.t += dt;
    if (this.t > -6 && !this.pictures.length && !this.loading) void this.load();
    const n = this.pictures.length;
    const span = RISE + n * HOLD + Math.max(0, n - 1) * FLIP + RISE;
    if (this.t > span) this.t = -EVERY;
    const on = visible && n > 0 && this.t >= 0;
    this.group.visible = on;
    if (!on) return;
    const t = this.t;
    // which picture, and where the flip wave is (it runs column by column across the stand)
    const cycle = HOLD + FLIP;
    const k = Math.max(0, t - RISE);
    const pi = Math.min(n - 1, Math.floor(k / cycle));
    const inFlip = k - pi * cycle - HOLD;
    const raise = Math.min(1, t / RISE, Math.max(0, (span - t) / RISE));
    for (let i = 0; i < this.base.length; i++) {
      const b = this.base[i];
      let pic = pi,
        sy = 1;
      if (inFlip > 0 && pi < n - 1) {
        // this card's moment in the wave
        const f = (inFlip - (this.col[i] / G) * (FLIP - 0.5)) / 0.5;
        if (f > 0) {
          sy = Math.abs(Math.cos(Math.min(1, f) * Math.PI));
          if (f > 0.5) pic = pi + 1;
        }
      }
      if (i % 1 === 0) this.paint(i, this.pictures[pic]);
      // raised: up from the laps; cards per row a beat apart
      const r = Math.min(1, Math.max(0, raise * 1.3 - (this.px[i] % G) * 0.004));
      this.m4.compose(b.p.clone().setY(b.p.y - (1 - r) * 1.2), b.q, this.s.set(this.w * r, this.h * sy * r, 1));
      this.mesh.setMatrixAt(i, this.m4);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
