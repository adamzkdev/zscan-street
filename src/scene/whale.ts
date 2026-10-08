import * as THREE from "three";
import type { Tx } from "../data/types";
import { C, E, G, VoxelModel, hash } from "./voxel/model";
import { toObject } from "./voxel/mesher";

/**
 * The whale: when a big public amount moves (≥ 500 ZEC on the transparent side), a glass whale
 * full of gold swims over the avenue, from the miners' tunnel to the chain's. Everyone can see
 * what it carries: that is the point of a transparent address. Visitors shield it by tapping it
 * (each tap is a proof): the glass clouds over, and once fully shielded it turns into a dark
 * shielded whale that dives away with fireworks. Too slow, and it swims off into the tunnel.
 */

const L = 60; // body length (voxels, 6 per metre)
const R = 12; // body radius

function bodyModel() {
  const m = new VoxelModel(L + 2, R * 2 + 4, R * 2 + 4);
  const cy = R + 2,
    cz = R + 2;
  const glass = G("#8fd6ff");
  const rim = G("#5fb4ee");
  const belly = G("#d6f1ff");
  for (let x = 0; x < L; x++) {
    const t = x / (L - 1);
    // thick head (front, +x), tapering to the tail stock
    const prof = Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.92 + 0.08)), 0.55) * (0.45 + 0.55 * Math.min(1, t * 1.6));
    const r = Math.max(2, R * prof);
    for (let y = -R; y <= R; y++)
      for (let z = -R; z <= R; z++) {
        const e = (y / (r * 0.86)) ** 2 + (z / r) ** 2;
        if (e > 1) continue;
        const shell = e > 0.72;
        if (shell) m.set(x, cy + y, cz + z, y < -r * 0.35 ? belly : (x + y + z) % 7 === 0 ? rim : glass);
        // the gold inside, heaped in the lower half, as a public balance anyone can read
        else if (y < -r * 0.15 && x > L * 0.18 && x < L * 0.88 && hash(x, y, z, 7) > 0.35) m.set(x, cy + y, cz + z, hash(x, y, z, 3) > 0.5 ? E("#ffc93a", 2.2) : E("#f4a21a", 1.6));
      }
  }
  // eyes and a mouth line at the head
  for (const s of [-1, 1]) {
    m.box(L - 10, cy + 2, cz + s * (R - 2) - 1, L - 7, cy + 5, cz + s * (R - 2) + 2, C("#0b1020"));
    m.set(L - 9, cy + 4, cz + s * (R - 1), C("#ffffff"));
  }
  m.box(L - 14, cy - 3, cz - R + 3, L - 1, cy - 2, cz + R - 2, C("#244a77"));
  // pectoral fins
  for (const s of [-1, 1]) for (let i = 0; i < 9; i++) m.box(L - 26 + i, cy - 6 - Math.floor(i / 2), cz + s * (R + i * 0.25) - 1, L - 24 + i, cy - 5 - Math.floor(i / 2), cz + s * (R + i * 0.25) + 1, rim);
  // blowhole
  m.box(L - 18, cy + R - 2, cz - 1, L - 16, cy + R + 1, cz + 2, C("#244a77"));
  return m;
}

function tailModel() {
  const m = new VoxelModel(16, 6, 34);
  const glass = G("#8fd6ff");
  const rim = G("#5fb4ee");
  for (let x = 0; x < 16; x++) {
    const half = Math.round(4 + (x / 15) * 13);
    for (let z = 17 - half; z < 17 + half; z++) {
      const notch = x > 11 && Math.abs(z - 17) < 2;
      if (!notch) m.box(x, 2, z, x + 1, 4, z + 1, x > 13 || Math.abs(z - 17) > half - 2 ? rim : glass);
    }
  }
  return m;
}

export interface WhaleHooks {
  /** A tap landed (sound, a few ⓩ). */
  hit(left: number): void;
  /** Fully shielded: fireworks, the reward. */
  shielded(tx: Tx): void;
  /** It got away. */
  escaped(tx: Tx): void;
  project(v: THREE.Vector3): { x: number; y: number } | null;
}

const HP = 30;
const SPEED = 4.2; // m/s
const ALT = 13;

export class Whale {
  readonly group = new THREE.Group();
  private tail: THREE.Group;
  private mats: THREE.Material[] = [];
  private glass: THREE.Material[] = [];
  private tag: HTMLButtonElement;
  private sparks: THREE.Points;
  private sparkVel: Float32Array;
  private sparkLife = 0;
  tx: Tx | null = null;
  private hp = HP;
  private done: "shielded" | "escaped" | null = null;
  private t = 0;
  private x0: number;
  private x1: number;
  private z: number;

  constructor(
    scene: THREE.Scene,
    ui: HTMLElement,
    path: { x0: number; x1: number; z: number },
    private hooks: WhaleHooks,
  ) {
    this.x0 = path.x0;
    this.x1 = path.x1;
    this.z = path.z;
    // the body is centred on x and z, its feet at y 0: lift it so its axis sits on the group's
    const body = toObject(bodyModel(), { own: true, shadows: true });
    body.position.y = -(R + 2) / 6;
    // the tail flaps up and down round a pivot at the tail stock
    const tail = toObject(tailModel(), { own: true, shadows: true });
    tail.position.set(-16 / 12, -3 / 6, 0);
    this.tail = new THREE.Group();
    this.tail.position.set(-L / 12 + 0.3, 0, 0);
    this.tail.add(tail);
    this.group.add(body, this.tail);
    this.group.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (!m) return;
      this.mats.push(m);
      // see-through glass: the gold inside shows (a public balance)
      if (o.userData.kind === "glass") {
        this.glass.push(m);
        m.transparent = true;
        m.opacity = 0.42;
        m.depthWrite = false;
        o.renderOrder = 2;
      }
    });
    // gold sparks: each tap is a proof
    const N = 160;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this.sparkVel = new Float32Array(N * 3);
    this.sparks = new THREE.Points(g, new THREE.PointsMaterial({ color: "#ffd25a", size: 0.35, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.sparks.frustumCulled = false;
    this.group.add(this.sparks);
    this.group.visible = false;
    scene.add(this.group);

    this.tag = document.createElement("button");
    this.tag.className = "whaletag hud";
    this.tag.style.display = "none";
    ui.append(this.tag);
    this.tag.addEventListener("click", () => this.tap());
  }

  get active() {
    return this.group.visible;
  }

  get position() {
    return this.group.position;
  }

  /** Total taps needed (more with more visitors in the city). */
  private max = HP;

  spawn(tx: Tx, visitors = 0) {
    this.tx = tx;
    this.max = HP + 6 * Math.min(20, visitors);
    this.hp = this.max;
    this.done = null;
    this.t = 0;
    this.group.visible = true;
    this.group.rotation.set(0, 0, 0);
    this.group.scale.setScalar(1);
    for (const m of this.mats) (m as THREE.MeshStandardMaterial).color?.set("#ffffff");
    for (const m of this.glass) m.opacity = 0.42;
    this.group.position.set(this.x0, ALT, this.z);
    this.render();
  }

  /** A click in the city: true when it landed on the whale (and counted as a tap). */
  hit(ray: THREE.Raycaster) {
    if (!this.active || this.done) return false;
    const sphere = new THREE.Sphere(this.group.position.clone(), 5.5);
    if (!ray.ray.intersectsSphere(sphere)) return false;
    this.tap();
    return true;
  }

  /** Another visitor's tap, relayed by the presence socket. */
  remote() {
    if (!this.active || this.done || !this.tx) return;
    this.proof(false);
  }

  tap() {
    if (!this.active || this.done || !this.tx) return;
    this.proof(true);
  }

  private proof(mine: boolean) {
    if (!this.tx) return;
    this.hp--;
    this.burst();
    if (mine) this.hooks.hit(this.hp);
    // the glass clouds over, toward the shielded violet-black
    const k = 1 - this.hp / this.max;
    const c = new THREE.Color("#ffffff").lerp(new THREE.Color("#3a2a66"), k);
    for (const m of this.mats) (m as THREE.MeshStandardMaterial).color?.copy(c);
    // the glass clouds over: less and less of the gold shows
    for (const m of this.glass) m.opacity = 0.42 + 0.5 * k;
    if (this.hp <= 0) {
      this.done = "shielded";
      this.t = 0;
      for (const m of this.mats) (m as THREE.MeshStandardMaterial).color?.set("#1a1230");
      for (const m of this.glass) m.opacity = 1;
      this.hooks.shielded(this.tx);
    }
    this.render();
  }

  private burst() {
    const pos = this.sparks.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(i, (Math.random() - 0.5) * 6, Math.random() * 2, (Math.random() - 0.5) * 3);
      this.sparkVel[i * 3] = (Math.random() - 0.5) * 6;
      this.sparkVel[i * 3 + 1] = 2 + Math.random() * 5;
      this.sparkVel[i * 3 + 2] = (Math.random() - 0.5) * 6;
    }
    pos.needsUpdate = true;
    this.sparkLife = 1;
  }

  private render() {
    if (!this.tx) return;
    const zec = (this.tx.visible ?? 0) / 1e8;
    const amount = zec.toLocaleString("en-US", { maximumFractionDigits: 0 });
    const filled = Math.round((1 - this.hp / this.max) * 10);
    this.tag.innerHTML =
      this.done === "shielded"
        ? `<b>SHIELDED</b><span>${amount} ZEC out of sight</span>`
        : `<b>🐋 ${amount} ZEC</b><span>TRANSPARENT · tap to shield</span><i>${"▮".repeat(filled)}${"▯".repeat(10 - filled)}</i>`;
    this.tag.classList.toggle("won", this.done === "shielded");
  }

  update(dt: number) {
    if (!this.active) return;
    this.t += dt;
    const p = this.group.position;
    if (this.done === "shielded") {
      // a dive: nose down into the avenue, then gone
      this.group.rotation.z = Math.max(-0.9, this.group.rotation.z - dt * 0.6);
      p.x += dt * SPEED * 1.6;
      p.y -= dt * (2 + this.t * 3);
      if (this.t > 4) this.hide();
    } else {
      p.x += dt * SPEED;
      p.y = ALT + Math.sin(this.t * 0.9) * 0.8;
      this.group.rotation.z = Math.sin(this.t * 0.9 + 1) * 0.06;
      if (p.x > this.x1) {
        this.done = "escaped";
        if (this.tx) this.hooks.escaped(this.tx);
        this.hide();
      }
    }
    this.tail.rotation.z = Math.sin(this.t * 3.2) * 0.35;
    if (this.sparkLife > 0) {
      this.sparkLife -= dt * 0.9;
      const pos = this.sparks.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        this.sparkVel[i * 3 + 1] -= 9 * dt;
        pos.setXYZ(i, pos.getX(i) + this.sparkVel[i * 3] * dt, pos.getY(i) + this.sparkVel[i * 3 + 1] * dt, pos.getZ(i) + this.sparkVel[i * 3 + 2] * dt);
      }
      pos.needsUpdate = true;
      (this.sparks.material as THREE.PointsMaterial).opacity = Math.max(0, this.sparkLife);
    }
    this.sparks.visible = this.sparkLife > 0;
    const at = this.hooks.project(new THREE.Vector3(p.x + 2, p.y + 3.4, p.z));
    if (at) {
      this.tag.style.display = "";
      this.tag.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px) translate(-50%, -100%)`;
    } else this.tag.style.display = "none";
  }

  hide() {
    this.group.visible = false;
    this.tag.style.display = "none";
    this.tx = null;
  }
}
