import * as THREE from "three";
import type { City } from "./city";
import { Blimp } from "./rides/blimp";
import { Flyer } from "./rides/flyer";

/**
 * What flies over ZStreet, and the rides on it: the ZEC FLYER (a 52 m observation wheel on the
 * south bank) and the ZEC BLIMP (an airship looping the city, LED band with the live block and
 * price). Board either one and you ride it in first person: in a capsule among other passengers,
 * or in the blimp's gondola on a tour of the landmarks; drag to look around, the real city outside.
 */
export type RideKind = "flyer" | "blimp";

export class Sky {
  readonly flyer: Flyer;
  readonly blimp: Blimp;
  /** What the map camera follows during a ride (kept on the rider's eye). */
  readonly seat = new THREE.Object3D();
  private kind: RideKind | null = null;
  private look = { yaw: 0, pitch: 0 };
  private drag: { x: number; y: number } | null = null;
  private back: { at: THREE.Vector3; zoom: number } | null = null;
  private height: number | null = null;
  private eyeAt = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler(0, 0, 0, "YXZ");
  private fallbackQ = new THREE.Quaternion();
  private fallbackR = new THREE.Vector3(1, 0, 0);

  constructor(city: City) {
    this.flyer = new Flyer(city.group);
    this.blimp = new Blimp(city.group, city);
    city.group.add(this.seat);
    // free look while riding: drag anywhere on the view
    window.addEventListener("pointerdown", (e) => {
      if (this.kind && e.target instanceof HTMLCanvasElement && e.button === 0) this.drag = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener("pointermove", (e) => {
      if (!this.drag || !this.kind) return;
      const k = 0.0042;
      this.look.yaw -= (e.clientX - this.drag.x) * k;
      this.look.pitch = THREE.MathUtils.clamp(this.look.pitch - (e.clientY - this.drag.y) * k, -1.35, 1.2);
      this.drag = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener("pointerup", () => (this.drag = null));
    window.addEventListener("keydown", (e) => {
      if (!this.kind || (document.activeElement && /input|textarea/i.test(document.activeElement.tagName))) return;
      if (e.key === "ArrowLeft") this.look.yaw += 0.12;
      else if (e.key === "ArrowRight") this.look.yaw -= 0.12;
      else if (e.key === "ArrowUp") this.look.pitch = Math.min(1.2, this.look.pitch + 0.1);
      else if (e.key === "ArrowDown") this.look.pitch = Math.max(-1.35, this.look.pitch - 0.1);
    });
  }

  setHeight(h: number | null) {
    if (h !== null && this.height !== null && h > this.height) {
      this.flyer.block(h);
      this.blimp.block(h);
    }
    this.height = h;
    this.flyer.height = h;
    this.blimp.height = h;
  }

  /** What a click would board: the wheel (or its deck), the blimp, or the blimp's mooring mast. */
  hit(ray: THREE.Raycaster): RideKind | null {
    if (this.kind) return null;
    const f = this.flyer.hit(ray),
      m = this.flyer.hitMast(ray),
      b = this.blimp.hit(ray);
    const best = [
      [f, "flyer"],
      [m, "blimp"],
      [b, "blimp"],
    ].filter((x) => x[0] !== null) as [number, RideKind][];
    if (!best.length) return null;
    best.sort((a, c) => a[0] - c[0]);
    return best[0][1];
  }

  /** Board a ride; `from`/`zoom` is the map view to come back to. Returns what the camera follows. */
  board(kind: RideKind = "flyer", from?: THREE.Vector3, zoom = 1) {
    if (this.kind) this.stopRide();
    this.kind = kind;
    this.back = from ? { at: from.clone(), zoom } : null;
    if (kind === "flyer") {
      this.flyer.board();
      this.look = { yaw: 0, pitch: -0.08 };
    } else {
      this.blimp.board();
      this.look = { yaw: -0.5, pitch: -0.32 };
    }
    this.placeSeat();
    return this.seat;
  }

  get riding() {
    if (this.kind === "flyer") return !!this.flyer.ride;
    if (this.kind === "blimp") return !this.blimp.done;
    return false;
  }

  get ride() {
    return this.kind;
  }

  /** Off the ride (LEAVE): back where you were. */
  stopRide() {
    this.flyer.stop();
    this.blimp.stop();
    this.blimp.done = false;
    this.kind = null;
    this.drag = null;
  }

  /**
   * The ride is over (main calls this once): where to go next. After a full lap of the wheel you
   * step out onto its deck (`walk`); otherwise back to the map view you came from.
   */
  leave(): { walk: { pos: THREE.Vector3; yaw: number } | null; back: { at: THREE.Vector3; zoom: number } | null } {
    const lapDone = this.kind === "flyer" && !this.flyer.ride;
    this.stopRide();
    return { walk: lapDone ? this.flyer.exit : null, back: this.back };
  }

  /** Floor heights on foot (the Flyer's deck and stairs). */
  groundAt(x: number, z: number) {
    return this.flyer.groundAt(x, z);
  }

  /** Put the riding camera on the rider's eye, looking where the viewer dragged. */
  aim(cam: THREE.PerspectiveCamera) {
    if (!this.kind) return;
    const base = this.kind === "blimp" ? this.blimp.yaw : 0;
    if (this.kind === "flyer") this.flyer.eye(this.eyeAt);
    else this.blimp.eye(this.eyeAt);
    cam.position.copy(this.eyeAt);
    this.e.set(this.look.pitch, base + this.look.yaw, 0, "YXZ");
    cam.quaternion.copy(this.q.setFromEuler(this.e));
    cam.updateMatrixWorld();
  }

  private placeSeat() {
    if (!this.kind) return;
    if (this.kind === "flyer") this.flyer.eye(this.eyeAt);
    else this.blimp.eye(this.eyeAt);
    // the rig frames a car from its local (-4.25, 2.6, 0) toward (4.2, 0.9, 0): keep that on the eye
    this.seat.position.copy(this.eyeAt).sub(new THREE.Vector3(4.2, 0.9, 0));
    this.seat.rotation.set(0, 0, 0);
    this.seat.updateMatrixWorld(true);
  }

  update(t: number, dt: number, camQuat?: THREE.Quaternion, camRight?: THREE.Vector3) {
    const night = document.documentElement.dataset.theme === "night";
    const q = camQuat ?? this.fallbackQ,
      r = camRight ?? this.fallbackR;
    this.flyer.update(dt, t, q, r, night);
    this.blimp.update(dt, t, q, r, night, this.kind === "blimp");
    this.placeSeat();
  }
}
