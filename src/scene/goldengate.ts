import * as THREE from "three";
import type { City } from "./city";
import { BAY, CURB, ST } from "./city/plan";
import { toObject } from "./voxel/mesher";
import { sedanModel, taxiModel, truckModel } from "./voxel/vehicles";

/**
 * The Golden Gate comes alive: cars and trucks cross it both ways (four lanes, up the ramps and over
 * the span, the deck's real height under their wheels), in and out of a tunnel in the headland; on
 * foot you can walk across on its deck.
 */

const LANES = [-3.2, -1.1, 1.1, 3.2];
const PAINTS: [string, string][] = [
  ["#c8ccd4", "#3ef0ff"],
  ["#2a2a34", "#ff3e8a"],
  ["#8a2a3a", "#ff9f2e"],
  ["#2a4a7a", "#3ef0ff"],
  ["#e8e4dc", "#b07bff"],
];

interface Car {
  obj: THREE.Object3D;
  lane: number;
  dir: 1 | -1;
  z: number;
  v: number;
}

export class GoldenGate {
  readonly ok: boolean;
  private x = BAY.bridge.x;
  /** City end and headland end of the deck (z), and the deck's height every metre between. */
  private z0 = ST.ringS + 5;
  private z1 = BAY.headland.z0 + 4;
  private h: Float32Array = new Float32Array(0);
  private cars: Car[] = [];
  private group = new THREE.Group();
  private spawnIn = 0;

  constructor(scene: THREE.Object3D, city: City) {
    const lm = city.landmarks.get("bridge");
    this.ok = !!lm;
    if (!lm) return;
    scene.add(this.group);
    // the deck's height along its centre line, measured once on the bridge's own model
    const ray = new THREE.Raycaster();
    const n = Math.ceil(this.z1 - this.z0) + 1;
    this.h = new Float32Array(n);
    const target = lm.occluder.full;
    target.updateMatrixWorld(true);
    for (let i = 0; i < n; i++) {
      let best = CURB;
      for (const lx of [-2.2, 2.2]) {
        ray.set(new THREE.Vector3(this.x + lx, 40, this.z0 + i), new THREE.Vector3(0, -1, 0));
        for (const hit of ray.intersectObject(target, true)) if (hit.point.y < 13 && hit.point.y > best) best = hit.point.y;
      }
      this.h[i] = best;
    }
    // smooth out the voxel steps of the ramps
    for (let pass = 0; pass < 3; pass++) for (let i = 1; i < n - 1; i++) this.h[i] = (this.h[i - 1] + this.h[i] * 2 + this.h[i + 1]) / 4;
    // the headland tunnel the road disappears into
    const portal = new THREE.Group();
    const dark = new THREE.Mesh(new THREE.BoxGeometry(12, 6, 0.5), new THREE.MeshBasicMaterial({ color: "#050508" }));
    dark.position.set(0, 3, 0);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(14, 7.6, 1.6), new THREE.MeshStandardMaterial({ color: "#6a6470", roughness: 0.9 }));
    frame.position.set(0, 3.8, 0.6);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(11, 0.2, 0.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.6, 0.6), toneMapped: false }));
    lamp.position.set(0, 6.1, -0.3);
    portal.add(frame, dark, lamp);
    portal.position.set(this.x, this.deckAt(this.z1), this.z1 + 2);
    this.group.add(portal);
    for (let i = 0; i < 10; i++) this.spawn(true);
  }

  /** Deck height at z (null off the deck's length). */
  deckAt(z: number) {
    if (z < this.z0 || z > this.z1) return CURB;
    const i = Math.min(this.h.length - 1, Math.max(0, Math.round(z - this.z0)));
    return this.h[i];
  }

  /** Is (x, z) on the deck (between the railings)? */
  onDeck(x: number, z: number) {
    return this.ok && Math.abs(x - this.x) < 5.6 && z > this.z0 - 1 && z < this.z1;
  }

  /** On foot: the deck's height there, or null. */
  groundAt(x: number, z: number) {
    return this.onDeck(x, z) ? this.deckAt(z) : null;
  }

  private spawn(anywhere = false) {
    const li = Math.floor(Math.random() * 4);
    const dir: 1 | -1 = li < 2 ? -1 : 1;
    const r = Math.random();
    const model = r < 0.15 ? taxiModel() : r < 0.3 ? truckModel(["#e8e4dc", "#2e5ab8", "#c0302e"][Math.floor(Math.random() * 3)], Math.random() < 0.5 ? "proof" : "depot") : sedanModel(...PAINTS[Math.floor(Math.random() * PAINTS.length)]);
    const obj = toObject(model);
    obj.rotation.y = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    const z = anywhere ? this.z0 + Math.random() * (this.z1 - this.z0) : dir > 0 ? this.z0 : this.z1;
    const car: Car = { obj, lane: LANES[li], dir, z, v: 9 + Math.random() * 4 };
    for (const o of this.cars) if (o.lane === car.lane && Math.abs(o.z - car.z) < 9) return;
    this.cars.push(car);
    this.group.add(obj);
  }

  update(dt: number) {
    if (!this.ok) return;
    this.spawnIn -= dt;
    if (this.spawnIn <= 0 && this.cars.length < 18) {
      this.spawnIn = 0.8 + Math.random() * 1.6;
      this.spawn();
    }
    for (const c of this.cars) {
      // keep the gap to the car ahead in the lane
      let ahead = Infinity;
      for (const o of this.cars) if (o !== c && o.lane === c.lane && (o.z - c.z) * c.dir > 0) ahead = Math.min(ahead, Math.abs(o.z - c.z));
      const want = ahead < 8 ? 0 : ahead < 16 ? c.v * 0.5 : c.v;
      c.z += c.dir * want * dt;
      c.obj.position.set(this.x + c.lane, this.deckAt(c.z), c.z);
      // the city end: they come in from (and go out to) the ring road, growing in/out of view
      const fade = Math.min(1, (c.z - this.z0) / 4);
      c.obj.scale.setScalar(Math.max(0.01, fade));
    }
    this.cars = this.cars.filter((c) => {
      const gone = c.z < this.z0 - 0.5 || c.z > this.z1 + 3;
      if (gone) this.group.remove(c.obj);
      return !gone;
    });
  }
}
