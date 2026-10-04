import * as THREE from "three";
import { CITY } from "./city";
import { busSign, canvasTexture, updateCanvasTexture, zcashBadge } from "./textures";
import { toObject } from "./voxel/mesher";
import { VOX } from "./voxel/model";
import { BUS, BUS_SEATS, BUS_STANDING, busModel } from "./voxel/vehicles";

const LEN = BUS.w * VOX;
const WID = BUS.d * VOX;

export type BusPhase = "away" | "arriving" | "stopped" | "departing";

/** Voxel coordinates of the bus model to local space (model centred on its footprint). */
export const busLocal = (vx: number, vy: number, vz: number) => new THREE.Vector3((vx - BUS.w / 2) * VOX, vy * VOX, (vz - BUS.d / 2) * VOX);

/**
 * The block bus: one reusable vehicle with a real interior. It drives in when a block is mined,
 * opens its doors at the stop; riders walk the aisle to a seat (or stand holding a strap), then it
 * leaves carrying the block's transactions. Front faces +x, doors are on the +z side.
 */
export class BlockBus {
  readonly group = new THREE.Group();
  /** Riders are parented here, so they ride along. */
  readonly cabin = new THREE.Group();
  readonly height = BUS.h * VOX;
  readonly length = LEN;
  phase: BusPhase = "arriving";
  /** Block number shown on the signs. */
  blockHeight = 0;
  private signTex: THREE.CanvasTexture;
  private doors: { leaf: THREE.Mesh; closedX: number; dir: number; width: number }[] = [];
  private doorOpen = 0;
  private doorTarget = 0;
  private wheels: THREE.Mesh[] = [];
  private headlight: THREE.SpotLight;
  private taken = 0;

  constructor() {
    const g = this.group;
    g.add(toObject(busModel()));

    // glass panes over the window openings (both sides) and the windscreen
    const glass = new THREE.MeshPhysicalMaterial({ color: "#ffe2b8", transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide });
    const band = (BUS.win[1] - BUS.win[0]) * VOX;
    const bandY = ((BUS.win[0] + BUS.win[1]) / 2) * VOX;
    for (const z of [-WID / 2 + 0.01, WID / 2 - 0.01]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(LEN - 6 * VOX, band), glass);
      p.position.set(0, bandY, z);
      g.add(p);
    }
    const ws = new THREE.Mesh(new THREE.PlaneGeometry(WID - 4 * VOX, (BUS.h - 8 - BUS.floor) * VOX), glass);
    ws.position.set(LEN / 2 - 0.01, ((BUS.floor + 4 + BUS.h - 4) / 2) * VOX, 0);
    ws.rotation.y = Math.PI / 2;
    g.add(ws);

    // wheels with hubs
    const wheelGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.34, 18);
    const wheelMat = new THREE.MeshStandardMaterial({ color: "#121216", roughness: 0.9 });
    const hubMat = new THREE.MeshStandardMaterial({ color: "#8a8a94", roughness: 0.4, metalness: 0.6 });
    for (const vx of [10, 41])
      for (const z of [-WID / 2 + 0.17, WID / 2 - 0.17]) {
        const w = new THREE.Mesh(wheelGeo, wheelMat);
        w.rotation.x = Math.PI / 2;
        w.position.set((vx - BUS.w / 2) * VOX, 0.46, z);
        w.castShadow = true;
        w.add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.36, 8), hubMat));
        g.add(w);
        this.wheels.push(w);
      }

    // sliding doors: two glass leaves per opening
    const doorMat = new THREE.MeshPhysicalMaterial({ color: "#3a4054", metalness: 0.4, roughness: 0.3, transparent: true, opacity: 0.88 });
    const doorH = (BUS.h - 4 - BUS.floor - 1) * VOX;
    for (const [a, b] of BUS.doors) {
      const cx = ((a + b) / 2 - BUS.w / 2) * VOX;
      const half = ((b - a) / 2) * VOX;
      for (const dir of [-1, 1]) {
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(half, doorH, 0.05), doorMat);
        const closedX = cx + (dir * half) / 2;
        leaf.position.set(closedX, (BUS.floor + 1) * VOX + doorH / 2, WID / 2 + 0.03);
        g.add(leaf);
        this.doors.push({ leaf, closedX, dir, width: half });
      }
    }

    // lights
    this.headlight = new THREE.SpotLight("#fff1d6", 30, 18, 0.5, 0.6, 1.5);
    this.headlight.position.set(LEN / 2, 1, 0);
    this.headlight.target.position.set(LEN / 2 + 6, 0, 0);
    g.add(this.headlight, this.headlight.target);
    const inside = new THREE.PointLight("#ffd9a8", 7, 7, 1.6);
    inside.position.set(0, (BUS.h - 4) * VOX, 0);
    g.add(inside);

    // destination signs: front, both sides, back, and an LED over the aisle
    this.signTex = canvasTexture(busSign("BLOCK"));
    const signMat = new THREE.MeshBasicMaterial({ map: this.signTex, toneMapped: false, color: new THREE.Color(1.6, 1.6, 1.6) });
    const front = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.36), signMat);
    front.position.set(LEN / 2 + 0.02, (BUS.h - 3) * VOX, 0);
    front.rotation.y = Math.PI / 2;
    const side = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.3), signMat);
    side.position.set(-1.2, (BUS.win[1] + 1.5) * VOX, WID / 2 + 0.02);
    const sideB = side.clone();
    sideB.position.z = -WID / 2 - 0.02;
    sideB.rotation.y = Math.PI;
    const rear = front.clone();
    rear.position.x = -LEN / 2 - 0.02;
    rear.rotation.y = -Math.PI / 2;
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.22), signMat);
    inner.position.copy(busLocal(BUS.w - 12, BUS.h - 4.5, 7.5));
    inner.rotation.y = -Math.PI / 2;
    g.add(front, side, sideB, rear, inner);
    // ⓩ on both flanks
    const badgeMat = new THREE.MeshBasicMaterial({ map: zcashBadge(), toneMapped: false, color: new THREE.Color(1.4, 1.4, 1.4), transparent: true });
    for (const [x, z, ry] of [
      [-2.2, WID / 2 + 0.02, 0],
      [2.2, -WID / 2 - 0.02, Math.PI],
    ] as const) {
      const b = new THREE.Mesh(new THREE.CircleGeometry(0.34, 24), badgeMat);
      b.position.set(x, (BUS.floor + 3) * VOX, z);
      b.rotation.y = ry;
      g.add(b);
    }
    g.add(this.cabin);
  }

  /** World positions just outside each door, on the kerb (where the bus stands now). */
  doorPoints(): THREE.Vector3[] {
    const x = this.group.position.x;
    return BUS.doors.map(([a, b]) => new THREE.Vector3(x + ((a + b) / 2 - BUS.w / 2) * VOX, CITY.curb, CITY.road.z1 + 0.35));
  }

  spin(distance: number) {
    for (const w of this.wheels) w.rotation.y -= distance / 0.46;
  }

  /**
   * The walk inside, in cabin coordinates: step in through door `i`, into the aisle, along it to
   * the next free seat, or a standing spot by a strap once the seats are taken.
   */
  pathInside(i: number): { path: THREE.Vector3[]; seated: boolean } {
    const [a, b] = BUS.doors[i];
    const doorX = (a + b) / 2;
    const fl = BUS.floor + 1;
    const k = this.taken++;
    const seated = k < BUS_SEATS.length;
    const [sx, sz] = seated ? BUS_SEATS[k] : BUS_STANDING[(k - BUS_SEATS.length) % BUS_STANDING.length];
    const path = [busLocal(doorX, fl, BUS.d - 3), busLocal(doorX, fl, 7.5), busLocal(sx, fl, 7.5)];
    path.push(seated ? busLocal(sx - 0.5, BUS.floor + 4, sz) : busLocal(sx, fl, sz));
    return { path, seated };
  }

  /** A fresh bus for a new block. */
  setBlock(height: number) {
    this.taken = 0;
    this.blockHeight = height;
    updateCanvasTexture(this.signTex, busSign(`BLOCK ${height.toLocaleString("en-US")}`));
  }

  openDoors() {
    this.doorTarget = 1;
  }
  closeDoors(): Promise<void> {
    this.doorTarget = 0;
    return new Promise((r) => setTimeout(r, 900));
  }

  update(dt: number) {
    this.doorOpen += (this.doorTarget - this.doorOpen) * Math.min(1, dt * 6);
    for (const d of this.doors) d.leaf.position.x = d.closedX + d.dir * this.doorOpen * d.width * 0.95;
  }

  /** Where the bus currently is (for the follow camera). */
  get position() {
    return this.group.position;
  }
}
