import * as THREE from "three";
import type { Reach } from "./physics";

/**
 * Your two hands on the street, first person: blocky forearms in the city's voxel style, a dark
 * jacket with a Zcash-gold cuff and the zkSNARKs' mitten hands. They swing with the stride and pump
 * at a run, come up off the ground in a jump, brace on a hard landing. The line is thrown by the
 * hand on the side it goes to, swings in a row go hand to hand, the free one balances out to its
 * side and comes up ready to throw again; to yank off the street or climb a wall both take the
 * line; over a roof's edge both plant on it. Drawn in the scene and kept on the camera each frame.
 */
export interface Gait {
  stride: number;
  pace: number;
  air: boolean;
  dip: number;
}

const NO_REACH: Reach = { on: false, side: 1, hand: new THREE.Vector3(), shoulder: new THREE.Vector3(), both: 0, hand2: new THREE.Vector3(), shoulder2: new THREE.Vector3(), ready: false, next: 1, vaults: 0 };

/**
 * The walk read off a camera that only says where it is: the pace from how far it went, the stride
 * from the pace, off the floor when above eye height, the knees giving when it comes down. `scale`
 * makes the walker's stroll (3.2 m/s, Shift 6.4) read like a stride and a run.
 */
export class CameraGait implements Gait {
  stride = 0;
  pace = 0;
  air = false;
  dip = 0;
  private last = new THREE.Vector3();
  private had = false;
  private lastY = 0;
  private fall = 0;

  update(dt: number, at: THREE.Vector3, floorY: number, scale = 1.6, airborne?: boolean): Gait {
    if (!this.had || dt <= 0) {
      this.had = true;
      this.last.copy(at);
      this.lastY = at.y;
      return this;
    }
    const d = Math.hypot(at.x - this.last.x, at.z - this.last.z);
    // (a cut: no stride in it)
    const v = d > 1.5 ? 0 : (d / dt) * scale;
    this.pace += (v - this.pace) * (1 - Math.exp(-dt * 10));
    this.stride += this.pace * dt * 1.5;
    const vy = Math.abs(at.y - this.lastY) > 1.5 ? 0 : (at.y - this.lastY) / dt;
    const air = airborne ?? at.y - floorY - 1.6 > 0.15;
    if (air) this.fall = Math.max(this.fall, -vy);
    else if (this.air) {
      this.dip = Math.min(1, this.fall / 12);
      this.fall = 0;
    }
    this.air = air;
    this.dip *= Math.exp(-dt * 9);
    this.last.copy(at);
    this.lastY = at.y;
    return this;
  }

  reset() {
    this.had = false;
    this.pace = this.dip = this.fall = 0;
    this.air = false;
  }
}

/** Per box face, the shade: the voxel city's own flat lighting baked into the colours. */
const SHADES = [0.86, 0.72, 1.06, 0.55, 0.8, 0.94];
const SLEEVE = 0x23263a;
const CUFF = 0xf4b728;
const MITT = 0xeee4cf;
const THUMB = 0xd9cdb4;

/** A forearm: the sleeve back along +z from the hand at the origin, a gold cuff, a mitten with its thumb. */
function forearm() {
  // [x, y, z, w, h, d, colour]
  const parts: [number, number, number, number, number, number, number][] = [
    [0, 0, 0.25, 0.05, 0.05, 0.38, SLEEVE],
    [0, 0, 0.055, 0.056, 0.056, 0.02, CUFF],
    [0, 0, 0, 0.048, 0.052, 0.072, MITT],
    [0.023, 0.01, -0.018, 0.016, 0.021, 0.025, THUMB],
  ];
  const pos: number[] = [],
    col: number[] = [],
    idx: number[] = [];
  const c = new THREE.Color();
  for (const [x, y, z, w, h, d, hex] of parts) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    const p = g.getAttribute("position");
    const base = pos.length / 3;
    c.setHex(hex, THREE.SRGBColorSpace);
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      const s = SHADES[Math.floor(i / 4)];
      col.push(c.r * s, c.g * s, c.b * s);
    }
    g.index!.array.forEach((v) => idx.push(base + v));
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  out.setIndex(idx);
  return out;
}

const smooth = (from: number, to: number, dt: number, rate: number) => from + (to - from) * (1 - Math.exp(-dt * rate));
const VAULT = 0.5;

export class FootHands {
  readonly root = new THREE.Group();
  private arms: THREE.Mesh[];
  private mat = new THREE.MeshLambertMaterial({ vertexColors: true, fog: false });
  private t = 0;
  private airT = 0;
  private runT = 0;
  private shown = false;
  /** Per arm: its walking pose (eased), how much it is on the line, balancing, ready to throw. */
  private rest = [new THREE.Vector3(), new THREE.Vector3()];
  private restQ = [new THREE.Quaternion(), new THREE.Quaternion()];
  private onRope = [0, 0];
  private bal = [0, 0];
  private ready = [0, 0];
  private vaultT = 1;
  private vaults = 0;
  private lowT = 0;
  private v = new THREE.Vector3();
  private w = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private m = new THREE.Matrix4();
  private up = new THREE.Vector3(0, 1, 0);

  /** `fov`: the view's width at rest (the swing widens it at speed: the hands stay put). */
  constructor(
    private camera: THREE.PerspectiveCamera,
    scene: THREE.Scene,
    private fov: number,
  ) {
    const g = forearm();
    this.arms = [new THREE.Mesh(g, this.mat), new THREE.Mesh(g, this.mat)];
    for (const a of this.arms) a.frustumCulled = false;
    this.root.add(...this.arms);
    this.root.visible = false;
    this.root.userData.noField = true;
    scene.add(this.root);
  }

  /** Hidden at once (on the map, inside a place, photo mode). */
  hide() {
    this.root.visible = this.shown = false;
  }

  /**
   * `lower`: put away for now (a panel or a talk up): they sink out of view, and come back after.
   */
  update(dt: number, gait: Gait, reach: Reach = NO_REACH, lower = false) {
    const first = !this.shown;
    this.shown = true;
    this.lowT = first && lower ? 1 : smooth(this.lowT, lower ? 1 : 0, dt, lower ? 7 : 9);
    this.root.visible = this.lowT < 0.98;
    // on the camera, wherever it is now
    this.camera.updateMatrixWorld();
    this.root.position.setFromMatrixPosition(this.camera.matrixWorld);
    this.root.quaternion.setFromRotationMatrix(this.camera.matrixWorld);
    // the same picture whatever the view's width (the hands were drawn for 80°)
    const f = Math.tan((this.fov * Math.PI) / 360) / Math.tan((80 * Math.PI) / 360);
    this.root.scale.set(f, f, 1);
    this.root.updateMatrixWorld();
    const k = first ? 1 : 1 - Math.exp(-dt * 16);
    this.t += dt;
    if (reach.vaults !== this.vaults) {
      this.vaults = reach.vaults;
      this.vaultT = 0;
    }
    this.vaultT = Math.min(1, this.vaultT + dt / VAULT);
    const moving = gait.air ? 0 : Math.min(1, gait.pace / 5.5);
    this.runT = smooth(this.runT, gait.pace > 7.5 && !gait.air ? 1 : 0, dt, 6);
    this.airT = smooth(this.airT, gait.air ? 1 : 0, dt, 7);
    const s = Math.sin(gait.stride);
    const swing = moving * (0.6 + this.runT * 0.9);
    const breathe = Math.sin(this.t * 1.7) * 0.004 * (1 - moving);
    // over a roof's edge: both palms down on it, quick, then up again
    const vault = this.vaultT >= 1 ? 0 : this.vaultT < 0.25 ? Math.sin((this.vaultT / 0.25) * Math.PI * 0.5) : Math.cos(((this.vaultT - 0.25) / 0.75) * Math.PI * 0.5);
    // a hard landing: both hands out and down, bracing (a soft one is only the knees)
    const brace = Math.max(0, gait.dip - 0.3) / 0.7;
    const lead = reach.side >= 0 ? 0 : 1;
    for (let i = 0; i < 2; i++) {
      const arm = this.arms[i];
      const side = i === 0 ? 1 : -1;
      // on the line: the hand that threw it; the other too while pulling with both
      const ropeTo = reach.on ? (i === lead ? 1 : reach.both) : 0;
      this.onRope[i] = first ? ropeTo : smooth(this.onRope[i], ropeTo, dt, ropeTo > this.onRope[i] ? 26 : 9);
      // the free hand out to its side, for balance; up and forward when it is the one to throw next
      this.bal[i] = smooth(this.bal[i], reach.on && i !== lead ? 1 - reach.both : 0, dt, 5);
      this.ready[i] = smooth(this.ready[i], reach.ready && (reach.next >= 0 ? 0 : 1) === i ? 1 : 0, dt, 9);
      const bal = this.bal[i];
      const rdy = this.ready[i];
      // (the two arms swing against each other, as legs do)
      const sw = s * side * swing;
      const x = side * (0.27 - this.runT * 0.035 + this.airT * 0.05 + bal * 0.08 - rdy * 0.05 + brace * 0.04 - vault * 0.03);
      const y = -0.335 + breathe + Math.max(0, sw) * 0.025 + this.runT * 0.035 + this.airT * 0.06 - gait.dip * 0.09 - bal * 0.03 + rdy * 0.1 - brace * 0.05 - vault * 0.09 - this.lowT * 0.4;
      const z = -0.5 - sw * 0.055 + this.airT * 0.03 + bal * 0.05 - rdy * 0.1 - brace * 0.06 - vault * 0.14;
      const rx = 0.55 + sw * 0.32 + this.runT * 0.15 - this.airT * 0.35 + bal * 0.25 - rdy * 0.55 + brace * 0.5 + vault * 0.9 + this.lowT * 0.4;
      const ry = side * (0.32 - this.runT * 0.08 - bal * 0.25 + rdy * 0.1 - vault * 0.2);
      const rz = side * (-0.12 + this.airT * 0.25 - bal * 0.35);
      const rest = this.rest[i];
      const restQ = this.restQ[i];
      if (first) rest.set(x, y, z);
      else rest.lerp(this.v.set(x, y, z), k);
      this.q.setFromEuler(this.e.set(rx, ry, rz));
      if (first) restQ.copy(this.q);
      else restQ.slerp(this.q, k);
      const w = this.onRope[i];
      if (w < 0.001 || !reach.on) {
        arm.position.copy(rest);
        arm.quaternion.copy(restQ);
        continue;
      }
      // the hand where the line holds it, the sleeve back to its shoulder, eased in from where it was
      const hand = i === lead ? reach.hand : reach.hand2;
      const shoulder = i === lead ? reach.shoulder : reach.shoulder2;
      const at = this.root.worldToLocal(this.v.copy(hand));
      const back = this.root.worldToLocal(this.w.copy(shoulder));
      // (the sleeve runs along +z from the hand: look from the shoulder through the hand)
      this.m.lookAt(back, at, this.up);
      this.q.setFromRotationMatrix(this.m);
      arm.position.copy(rest).lerp(at, w);
      arm.quaternion.copy(restQ).slerp(this.q, w);
    }
    // the line leaves from the hand that holds it, wherever the easing has it now
    if (reach.on && reach.pin) {
      this.arms[lead].updateWorldMatrix(true, false);
      reach.pin(this.v.setFromMatrixPosition(this.arms[lead].matrixWorld));
    }
  }
}
