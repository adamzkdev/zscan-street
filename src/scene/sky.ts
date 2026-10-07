import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Market } from "../data/market";
import type { City } from "./city";
import { CITY, CURB } from "./city/plan";
import { toObject } from "./voxel/mesher";
import { C, E, G, shades, VoxelModel } from "./voxel/model";

/**
 * Two things that make the skyline move: the ZEC FLYER, a giant observation wheel in the riverside
 * park (Singapore Flyer style) turning slowly, its rim lit at night in the colours of the pools; and
 * the ZEC BLIMP, an airship circling the city with an LED band that carries the live block height
 * and the price.
 */

/** The riverside park, south of the river by the shōtengai's bridge. */
const FLYER = { x: -70, z: 88, r: 15, hub: 21.5 };

export class Sky {
  private wheel = new THREE.Group();
  private cabins: THREE.InstancedMesh;
  private rimLights: THREE.Mesh;
  private blimp = new THREE.Group();
  private band: { ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture };
  private angle = 0;
  private lap = 0;
  private redraw = 0;
  private height: number | null = null;
  /** A ride: the capsule you board, and a seat for the camera that follows it round. */
  readonly seat = new THREE.Object3D();
  private ride: { cabin: number; left: number } | null = null;
  private centreXZ = new THREE.Vector3();

  constructor(city: City) {
    const g = city.group;
    // ---- the wheel: the terminal (voxels), two white tubular A-frames, the rim on its hub ----
    const base = new VoxelModel(66, 16, 48);
    base.box(4, 0, 12, 62, 12, 44, G("#9fd6ff"));
    base.box(3, 12, 11, 63, 14, 45, C("#e8e4ec"));
    base.box(7, 14, 15, 59, 15, 41, shades(["#7ac08a", "#6ab07a", "#8ad09a"], 1, 4));
    base.box(8, 9, 44, 58, 11, 45, E("#f4b728", 1.6));
    for (let x = 6; x < 62; x += 6) base.box(x, 0, 43, x + 1, 12, 44, C("#c8c4d0"));
    const baseObj = toObject(base);
    baseObj.scale.setScalar(2);
    baseObj.position.set(FLYER.x, CURB, FLYER.z + 1.5);
    g.add(baseObj);
    const white = new THREE.MeshStandardMaterial({ color: "#f4f2f6", roughness: 0.35, metalness: 0.4 });
    white.userData.dayColor = "#ffffff";
    const tube = (a: THREE.Vector3, b: THREE.Vector3, r: number) => {
      const len = a.distanceTo(b);
      const geo = new THREE.CylinderGeometry(r, r, len, 8).translate(0, len / 2, 0);
      geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
      return geo.translate(a.x, a.y, a.z);
    };
    // the A-frames, either side of the rim, from the terminal roof to the hub
    const legs: THREE.BufferGeometry[] = [];
    const hubY = CURB + FLYER.hub;
    for (const side of [-1.6, 1.6])
      for (const dx of [-9, 9]) {
        legs.push(tube(new THREE.Vector3(FLYER.x + dx, CURB + 4.6, FLYER.z + side * 2.2), new THREE.Vector3(FLYER.x, hubY, FLYER.z + side), 0.45));
      }
    legs.push(tube(new THREE.Vector3(FLYER.x, hubY, FLYER.z - 2), new THREE.Vector3(FLYER.x, hubY, FLYER.z + 2), 0.9));
    g.add(new THREE.Mesh(mergeGeometries(legs, false), white));
    // the rim: two rings, cross-bracing between them, 28 spokes to the hub
    const R = FLYER.r;
    const parts: THREE.BufferGeometry[] = [new THREE.TorusGeometry(R, 0.22, 8, 96).translate(0, 0, 0.7), new THREE.TorusGeometry(R, 0.22, 8, 96).translate(0, 0, -0.7), new THREE.TorusGeometry(R - 1.4, 0.14, 6, 96)];
    for (let i = 0; i < 56; i++) {
      const a0 = (i / 56) * Math.PI * 2,
        a1 = ((i + 1) / 56) * Math.PI * 2;
      const p = (a: number, r: number, z: number) => new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, z);
      parts.push(tube(p(a0, R, 0.7), p(a1, R - 1.4, 0), 0.06), tube(p(a0, R, -0.7), p(a1, R - 1.4, 0), 0.06));
      if (i % 2 === 0) for (const z of [0.6, -0.6]) parts.push(tube(new THREE.Vector3(0, 0, z * 2), p(a0, R - 1.4, z * 0.4), 0.05));
    }
    parts.push(new THREE.CylinderGeometry(1.4, 1.4, 3.2, 16).rotateX(Math.PI / 2));
    this.wheel.add(new THREE.Mesh(mergeGeometries(parts.map((q) => (q.index ? q.toNonIndexed() : q)), false), white));
    this.wheel.position.set(FLYER.x, hubY, FLYER.z);
    g.add(this.wheel);
    // the rim's lights for the night: a ring that cycles through the pools' colours
    this.rimLights = new THREE.Mesh(new THREE.TorusGeometry(R + 0.3, 0.1, 6, 120), new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 1.6, 0.4), toneMapped: false }));
    (this.rimLights.material as THREE.Material).userData.night = true;
    this.wheel.add(this.rimLights);
    // 28 capsules on the rim, kept upright
    const capsule = new THREE.CapsuleGeometry(0.95, 2.4, 4, 12).rotateZ(Math.PI / 2);
    this.cabins = new THREE.InstancedMesh(capsule, new THREE.MeshStandardMaterial({ color: "#cfe8ff", emissive: "#3a5a78", emissiveIntensity: 0.6, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.88 }), 28);
    this.cabins.frustumCulled = false;
    g.add(this.cabins);
    g.add(this.seat);
    this.centreXZ.set(FLYER.x, 0, FLYER.z);
    // ---- the blimp ----
    const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 16).scale(14, 3.6, 3.6), new THREE.MeshStandardMaterial({ color: "#f4f2f6", roughness: 0.5, metalness: 0.1 }));
    const stripe = new THREE.Mesh(new THREE.SphereGeometry(1.01, 28, 16, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.16).scale(14, 3.6, 3.6), new THREE.MeshStandardMaterial({ color: "#f4b728", roughness: 0.4 }));
    const gondola = new THREE.Mesh(new THREE.BoxGeometry(4, 1.2, 1.4), new THREE.MeshStandardMaterial({ color: "#1a1820", roughness: 0.4 }));
    gondola.position.y = -3.9;
    const fins: THREE.Mesh[] = [];
    for (const [rx, ry] of [
      [0, 0],
      [Math.PI / 2, 0],
    ]) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(3.2, 4.6, 0.2), new THREE.MeshStandardMaterial({ color: "#1a1820" }));
      fin.position.x = -12.4;
      fin.rotation.set(rx, ry, 0);
      fins.push(fin);
    }
    // the LED band on both flanks
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 96;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.band = { ctx: c.getContext("2d")!, tex };
    for (const side of [1, -1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(16, 1.5), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(1.4, 1.4, 1.4) }));
      p.position.set(0, -0.4, side * 3.45);
      if (side < 0) p.rotation.y = Math.PI;
      this.blimp.add(p);
    }
    this.blimp.add(hull, stripe, gondola, ...fins);
    g.add(this.blimp);
    Market.subscribe(() => (this.redraw = 0));
  }

  setHeight(h: number | null) {
    if (h !== this.height) (this.height = h), (this.redraw = 0);
  }

  private drawBand(t: number) {
    const { ctx, tex } = this.band;
    const w = ctx.canvas.width,
      h = ctx.canvas.height;
    ctx.fillStyle = "#05060a";
    ctx.fillRect(0, 0, w, h);
    const p = Market.state.price;
    const text = `ⓩ ZSTREET   BLOCK #${this.height?.toLocaleString("en-US") ?? "—"}   ZEC ${p ? "$" + p.usd.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—"} ${p ? (p.usd_24h_change >= 0 ? "▲" : "▼") + Math.abs(p.usd_24h_change).toFixed(1) + "%" : ""}   PRIVACY IS NORMAL   `;
    ctx.font = '800 64px "JetBrains Mono", Menlo, monospace';
    ctx.textBaseline = "middle";
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = "#f4b728";
    for (let x = -((t * 120) % tw); x < w; x += tw) ctx.fillText(text, x, h / 2 + 4);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 2);
    tex.needsUpdate = true;
  }

  /** Did a click land on the wheel (its rim, legs or capsules)? */
  hit(ray: THREE.Raycaster) {
    return ray.intersectObjects([this.wheel, this.cabins], true).length > 0;
  }

  /** Board the capsule at the bottom and go round once (a minute, the wheel turns faster). */
  board() {
    let best = 0,
      low = Infinity;
    for (let i = 0; i < 28; i++) {
      const y = Math.sin(this.angle + (i / 28) * Math.PI * 2);
      if (y < low) (low = y), (best = i);
    }
    this.ride = { cabin: best, left: 60 };
    this.placeSeat();
    return this.seat;
  }

  get riding() {
    return this.ride !== null;
  }

  stopRide() {
    this.ride = null;
  }

  private placeSeat() {
    if (!this.ride) return;
    const a = this.angle + (this.ride.cabin / 28) * Math.PI * 2;
    const c = this.wheel.position;
    const p = new THREE.Vector3(c.x + Math.cos(a) * (FLYER.r + 1.4), c.y + Math.sin(a) * (FLYER.r + 1.4) - 0.4, c.z);
    // the ride camera sits at the seat's local (-4.25, 2.6, 0) looking along +x: aim +x at the city
    const toCity = new THREE.Vector3(10, 0, -60).sub(this.centreXZ).setY(0).normalize();
    this.seat.rotation.set(0, Math.atan2(-toCity.z, toCity.x), 0);
    this.seat.position.copy(p).sub(new THREE.Vector3(-4.25, 2.6 - 1.1, 0).applyEuler(this.seat.rotation));
    this.seat.updateMatrixWorld(true);
  }

  update(t: number, dt: number) {
    // one turn every ~4 minutes; a full turn in a minute while someone rides
    this.angle += dt * ((Math.PI * 2) / (this.ride ? 60 : 240));
    if (this.ride) {
      this.ride.left -= dt;
      this.placeSeat();
      if (this.ride.left <= 0) this.ride = null;
    }
    this.wheel.rotation.z = this.angle;
    const m = new THREE.Matrix4();
    const centre = this.wheel.position;
    for (let i = 0; i < 28; i++) {
      const a = this.angle + (i / 28) * Math.PI * 2;
      m.makeTranslation(centre.x + Math.cos(a) * (FLYER.r + 1.4), centre.y + Math.sin(a) * (FLYER.r + 1.4) - 0.6, centre.z);
      this.cabins.setMatrixAt(i, m);
    }
    this.cabins.instanceMatrix.needsUpdate = true;
    const hue = (t * 0.03) % 1;
    (this.rimLights.material as THREE.MeshBasicMaterial).color.setHSL(hue, 0.9, 0.55).multiplyScalar(2.2);
    // the blimp: a wide slow loop round the city at 95 m, nose into its path, a gentle roll
    this.lap += dt * 0.012;
    const rx = (CITY.maxX - CITY.minX) * 0.36,
      rz = (CITY.maxZ - CITY.minZ) * 0.3;
    const x = Math.cos(this.lap) * rx,
      z = Math.sin(this.lap) * rz - 30;
    this.blimp.position.set(x, 95 + Math.sin(t * 0.3) * 2, z);
    this.blimp.rotation.set(0, Math.atan2(-(Math.cos(this.lap) * rz), -Math.sin(this.lap) * rx) + Math.PI, Math.sin(t * 0.5) * 0.03);
    this.redraw -= dt;
    if (this.redraw <= 0) {
      this.redraw = 1 / 20;
      this.drawBand(t);
    }
  }
}
