import * as THREE from "three";
import { busSign, canvasTexture } from "./textures";
import { trackLight } from "./lights";
import { freeObject } from "./voxel/mesher";
import { VOX } from "./voxel/model";
import { bikeObject, carObject, spinWheels } from "./real/cars";

export type CarKind = "taxi" | "limo" | "sedan";

const SPEC = {
  taxi: { w: 27, d: 11, wheels: [5, 21], door: 11, tint: "#f2c230" },
  limo: { w: 46, d: 12, wheels: [7, 39], door: 30, tint: "#0e0e14" },
  sedan: { w: 24, d: 11, wheels: [5, 18], door: 10, tint: "#3a3a44" },
};
/**
 * What every copy of a vehicle shares: its wheels, door leaf, shutter (one geometry and material each,
 * never freed). Vehicles come and go all day; each made its own and left them on the GPU once gone.
 */
const keep = <T extends { userData: Record<string, unknown> }>(x: T) => ((x.userData.shared = true), x);
const once = <T>(make: () => T) => {
  let v: T | undefined;
  return () => (v ??= make());
};
const CAR_LEAF = once(() => keep(new THREE.BoxGeometry(5 * VOX, 6 * VOX, 0.06)));
const leafPaint = new Map<string, THREE.MeshStandardMaterial>();
const LEAF_PAINT = (tint: string) => {
  let m = leafPaint.get(tint);
  if (!m) leafPaint.set(tint, (m = keep(new THREE.MeshStandardMaterial({ color: tint, roughness: 0.35, metalness: 0.5 }))));
  return m;
};
const SHUTTER = once(() => keep(new THREE.PlaneGeometry(12 * VOX, 12 * VOX)));
const SHUTTER_PAINT = once(() => keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.42, 0.32), toneMapped: false })));

const PAINTS = [
  ["#c8ccd4", "#3ef0ff"],
  ["#2a2a34", "#ff3e8a"],
  ["#8a2a3a", "#ff9f2e"],
  ["#2a4a7a", "#3ef0ff"],
  ["#e8e4dc", "#b07bff"],
  ["#3a6a4a", "#38ff9c"],
];

/**
 * A taxi or a limousine. Front is +x in its own frame; the passenger door is on the +z side, so
 * a car turned to face west has that door on the north kerb. Drives along a straight line.
 */
export class Car {
  readonly group = new THREE.Group();
  readonly kind: CarKind;
  readonly length: number;
  private door: THREE.Object3D;
  private doorAngle = 0;
  private doorTarget = 0;

  constructor(kind: CarKind) {
    this.kind = kind;
    const s = SPEC[kind];
    this.length = s.w * VOX;
    const p = Math.floor(Math.random() * PAINTS.length);
    const [paint, glowc] = PAINTS[p];
    // the realistic body and its wheels (they roll: `spin`)
    const car = carObject(kind, kind === "taxi" ? { paint: "#f2c230" } : kind === "limo" ? { paint: "#0e0e14" } : { paint, glow: glowc });
    for (const c of [...car.children]) this.group.add(c);
    void p;
    // rear passenger door on the +z side, hinged at its front edge
    const hinge = new THREE.Group();
    hinge.position.set((s.door + 4 - s.w / 2) * VOX, 0, (s.d / 2) * VOX);
    const leaf = new THREE.Mesh(CAR_LEAF(), LEAF_PAINT(s.tint));
    leaf.position.set((-5 / 2) * VOX, 4 * VOX, 0.04);
    leaf.castShadow = true;
    hinge.add(leaf);
    this.group.add(hinge);
    this.door = hinge;
    if (kind !== "sedan") {
      const glow = trackLight(new THREE.PointLight(kind === "limo" ? "#b07bff" : "#ffd28a", 2.5, 4, 2));
      glow.position.set(0, 1.2, 0);
      this.group.add(glow);
    }
  }

  /** Gone for good (it drove off): what is its own is freed (the roof sign), the shared parts stay. */
  dispose(skip: THREE.Object3D[] = []) {
    this.group.removeFromParent();
    freeObject(this.group, skip);
  }

  /** A lit sign on the roof, both sides (the block number, when it carries a block). */
  roofSign(text: string) {
    const tex = canvasTexture(busSign(text));
    const m = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide });
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.42), m);
    plate.position.set(-0.2, 2.05, 0);
    this.group.add(plate);
  }

  /** Where a passenger stands to get in or out (world), on the door side. */
  doorPoint(): THREE.Vector3 {
    const s = SPEC[this.kind];
    return this.group.localToWorld(new THREE.Vector3((s.door + 1.5 - s.w / 2) * VOX, 0, (s.d / 2 + 5) * VOX));
  }

  /** A point a little ahead or behind the door along the kerb, for an escort to stand. */
  kerbPoint(offset: number): THREE.Vector3 {
    const s = SPEC[this.kind];
    return this.group.localToWorld(new THREE.Vector3((s.door + 1.5 - s.w / 2) * VOX + offset, 0, (s.d / 2 + 6) * VOX));
  }

  /** Turn the wheels by the distance driven (called by the traffic model). */
  spin(distance: number) {
    spinWheels(this.group, distance);
  }

  /** Offset along the car from its centre to the passenger door (car frame, metres). */
  get doorOffset() {
    const s = SPEC[this.kind];
    return (s.door + 1.5 - s.w / 2) * VOX;
  }

  openDoor() {
    this.doorTarget = 1;
    return new Promise((r) => setTimeout(r, 600));
  }
  closeDoor() {
    this.doorTarget = 0;
    return new Promise((r) => setTimeout(r, 600));
  }

  update(dt: number) {
    this.doorAngle += (this.doorTarget - this.doorAngle) * Math.min(1, dt * 7);
    this.door.rotation.y = this.doorAngle * 1.25;
    // (the leaf only shows swung open: shut, the body's own door is there)
    this.door.visible = this.doorAngle > 0.03;
  }
}

/**
 * Delivery truck: Proof Factory violet or depot amber. A roller door at the back opens to hand a
 * parcel over at the shop door.
 */
export class Truck {
  readonly group = new THREE.Group();
  readonly length = 40 * VOX;
  private shutter: THREE.Mesh;
  private shut = 0;
  private shutTarget = 0;

  constructor(readonly source: "proof" | "depot") {
    const truck = carObject("truck", { livery: source === "proof" ? "#5a3a8a" : "#c0782a", label: source });
    for (const c of [...truck.children]) this.group.add(c);
    this.shutter = new THREE.Mesh(SHUTTER(), SHUTTER_PAINT());
    this.shutter.position.set(-20 * VOX - 0.01, 11 * VOX, 0);
    this.shutter.rotation.y = -Math.PI / 2;
    this.shutter.visible = false;
    this.group.add(this.shutter);
  }

  spin(distance: number) {
    spinWheels(this.group, distance);
  }

  /** Gone for good: nothing of its own to free but its group (all its parts are shared). */
  dispose(skip: THREE.Object3D[] = []) {
    this.group.removeFromParent();
    freeObject(this.group, skip);
  }

  /** On the kerb by the cab's passenger door, where the driver gets out (world). */
  cabSide(): THREE.Vector3 {
    return this.group.localToWorld(new THREE.Vector3(14 * VOX, 0, 7 * VOX + 0.55));
  }

  /** Just behind the tail, on the ground (world). */
  behind(): THREE.Vector3 {
    return this.group.localToWorld(new THREE.Vector3(-20 * VOX - 0.55, 0, 0));
  }

  /** The tail of the truck, where parcels come out (world). */
  tail(): THREE.Vector3 {
    return this.group.localToWorld(new THREE.Vector3(-20 * VOX - 0.3, 0.9, 0));
  }

  open() {
    this.shutTarget = 1;
    this.shutter.visible = true;
  }
  close() {
    this.shutTarget = 0;
  }

  update(dt: number) {
    this.shut += (this.shutTarget - this.shut) * Math.min(1, dt * 6);
    this.shutter.scale.y = Math.max(0.01, this.shut);
    this.shutter.position.y = (5 + 6 * this.shut) * VOX + 6 * VOX * (1 - this.shut);
    if (this.shut < 0.02 && this.shutTarget === 0) this.shutter.visible = false;
  }
}

const LIVERIES = [
  ["#c0303a", "#f4b728"],
  ["#2e5ab8", "#ffffff"],
  ["#2a2a34", "#3ee08f"],
  ["#e8e4dc", "#ff3e8a"],
];

/** A delivery scooter: two wheels, a top box, a zkSNARK courier riding it (set by the director). */
export class Scooter {
  readonly group = new THREE.Group();
  readonly length = 12 * VOX;
  /** Where the rider's feet go (scooter frame). */
  readonly saddle = new THREE.Vector3(-0.75 * VOX, 0, 0);

  constructor() {
    const l = Math.floor(Math.random() * LIVERIES.length);
    const [paint, box] = LIVERIES[l];
    const bike = bikeObject("scooter", { paint, accent: box });
    for (const c of [...bike.children]) this.group.add(c);
  }

  spin(distance: number) {
    spinWheels(this.group, distance);
  }

  /** Gone for good (its rider, `skip`, is the director's to free). */
  dispose(skip: THREE.Object3D[] = []) {
    this.group.removeFromParent();
    freeObject(this.group, skip);
  }
}
