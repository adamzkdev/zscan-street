import * as THREE from "three";
import type { Tx } from "../data/types";
import { KIND_HELP, KIND_LABEL } from "../data/types";
import { links } from "../data/zscan";
import { KIND_COLOR, Snark, loadArt } from "../scene/snark";
import { fitText } from "../scene/fit";
import { toObject } from "../scene/voxel/mesher";
import { C, E, G, shades, VoxelModel } from "../scene/voxel/model";
import { box, glowMat, makeScene, room, std, textPlane } from "./kit";
import { buildArchive } from "./archive";
import type { Interior, InteriorContext, PickInfo, Rect } from "./types";
import { memePoster } from "../scene/memes";
import { nextMeme } from "../scene/memewalls";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const num = (n: number) => n.toLocaleString("en-US");
const zec = (zat: number, d = 5) => `${(zat / 1e8).toLocaleString("en-US", { minimumFractionDigits: Math.min(2, d), maximumFractionDigits: d })} ZEC`;
const short = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;
const ago = (ms: number) => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
};

/**
 * The MEMPOOL HQ's ground floor, 20 × 14 m: the pickup hall on the left (the glass front, the
 * pickup table, the lockers, the big board), the loading dock on the right behind a glazed
 * partition (the roller door open on the street, a truck backed up to it, the conveyor bringing
 * the parcels in, racking full of them).
 */
const SHOP_Y = 0;
/** The Block Archive upstairs (far above the shop: neither floor ever sees the other). */
const ARCHIVE_Y = 40;
const X0 = -10,
  X1 = 10,
  Z0 = -14,
  ROOF = 5.2;
/** The hall | dock partition, and the opening in it (z) where the conveyor comes through. */
const PART_X = 3,
  PASS_Z0 = -9,
  PASS_Z1 = -5;
/** The front door (centre x) and the roller door (x range). */
const DOOR_X = -3.5;
const ROLL_X0 = 4.8,
  ROLL_X1 = 9.2;
const TABLE_X = -3.8,
  TABLE_Z = -5.4,
  TABLE_TOP = 1.0;
/** Parcels on the table: two rows of 18, a second layer on top when it fills up. */
const COLS = 18;
const tableSlot = (i: number) => {
  const layer = Math.floor(i / (COLS * 2)),
    k = i % (COLS * 2);
  return new THREE.Vector3(TABLE_X - 3.57 + (k % COLS) * 0.42, TABLE_TOP + 0.15 + layer * 0.31, TABLE_Z + (Math.floor(k / COLS) ? -0.24 : 0.24));
};
/** The conveyor: along z by the roller door, then along x to the pass (belt height). */
const BELT_Y = 0.86;
const BELT: THREE.Vector3[] = [new THREE.Vector3(7.0, BELT_Y, -0.9), new THREE.Vector3(7.0, BELT_Y, -7.6), new THREE.Vector3(1.4, BELT_Y, -7.6)];

/**
 * Inside the MEMPOOL HQ. Ground floor: truck drivers come in through the loading dock with every
 * pending transaction as a parcel, the conveyor carries it into the hall and the dock hands set
 * it on the pickup table; zkSNARKs come in by the front door, take theirs and leave for the bus
 * stop; the big board on the back wall shows the mempool live. Upstairs (1F): the Block Archive,
 * where any block from genesis to the tip is rebuilt in the room (see archive/).
 */
export function buildMempool(ctx: InteriorContext): Interior {
  const scene = makeScene(ctx.renderer, "#0d0c12");
  const view = ctx.cityView("mempool", 1.7, 0.5);
  if (view) scene.background = view;
  const pickables: THREE.Object3D[] = [];
  const rects: Rect[] = [];
  const ticks: ((dt: number, t: number) => void)[] = [];

  rects.push(
    ...room(scene, {
      x0: X0,
      z0: Z0,
      x1: X1,
      z1: 0,
      h: ROOF,
      floor: new THREE.MeshStandardMaterial({ map: tileTexture(), roughness: 0.35, metalness: 0.05 }),
      wall: std("#d8d2c6", 0.9),
      ceiling: std("#7c7870", 0.9),
      open: true,
    }),
  );
  // the dock's own floor: sealed concrete with yellow lanes
  const dockFloor = new THREE.Mesh(new THREE.PlaneGeometry(X1 - PART_X, -Z0), new THREE.MeshStandardMaterial({ map: concreteTexture(), roughness: 0.7 }));
  dockFloor.rotation.x = -Math.PI / 2;
  dockFloor.position.set((PART_X + X1) / 2, 0.004, Z0 / 2);
  scene.add(dockFloor);

  // the chain's stripes round the hall, light panels over it, high-bay lamps over the dock
  for (const [y, c] of [
    [3.4, "#ff9f2e"],
    [3.25, "#3ec9b0"],
  ] as const) {
    box(scene, PART_X - X0, 0.1, 0.02, glowMat(c, 1.4), (X0 + PART_X) / 2, y, Z0 + 0.12);
    box(scene, 0.02, 0.1, -Z0 - 0.2, glowMat(c, 1.4), X0 + 0.12, y, Z0 / 2);
  }
  const panel = glowMat("#f4f0e8", 1.05);
  for (const x of [-7.5, -3.5, 0.5]) for (const z of [-2.6, -7.4, -11.6]) box(scene, 2.2, 0.04, 0.6, panel, x, ROOF - 0.06, z);
  const lamp = glowMat("#ffe2a8", 1.6);
  for (const z of [-3, -8, -12.4]) {
    box(scene, 0.7, 0.12, 0.7, std("#3a3842", 0.5, 0.6), 6.5, ROOF - 0.5, z);
    box(scene, 0.5, 0.03, 0.5, lamp, 6.5, ROOF - 0.53, z);
    box(scene, 0.03, 0.4, 0.03, std("#3a3842"), 6.5, ROOF - 0.4, z);
  }

  // ---- the front: glass either side of the doors, the roller door open on the street -------------
  const glass = new THREE.MeshStandardMaterial({ color: "#7aa0c0", roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.3 });
  const mullion = std("#2a2830", 0.6, 0.4);
  box(scene, DOOR_X - 1.6 - X0, 3.3, 0.05, glass, (X0 + DOOR_X - 1.6) / 2, 0.1, -0.05);
  box(scene, PART_X - (DOOR_X + 1.6), 3.3, 0.05, glass, (DOOR_X + 1.6 + PART_X) / 2, 0.1, -0.05);
  for (const x of [X0, -8, -6.6, DOOR_X - 1.6, DOOR_X + 1.6, 0.6, PART_X]) box(scene, 0.1, 3.4, 0.14, mullion, x, 0, -0.05);
  box(scene, PART_X - X0, 0.12, 0.14, mullion, (X0 + PART_X) / 2, 3.4, -0.05);
  box(scene, PART_X - X0, ROOF - 3.52, 0.14, std("#e6e1d6", 0.9), (X0 + PART_X) / 2, 3.52, -0.05);
  const name = textPlane("MEMPOOL 本社", { h: 0.62, color: "#ff9f2e", glow: true });
  name.position.set(DOOR_X, 4.25, -0.14);
  name.rotation.y = Math.PI;
  scene.add(name);
  // the dock's front wall round the roller door, the door rolled up, hazard posts
  box(scene, ROLL_X0 - PART_X, ROOF, 0.2, std("#cfc8bb", 0.9), (PART_X + ROLL_X0) / 2, 0, -0.1);
  box(scene, X1 - ROLL_X1, ROOF, 0.2, std("#cfc8bb", 0.9), (ROLL_X1 + X1) / 2, 0, -0.1);
  box(scene, ROLL_X1 - ROLL_X0, ROOF - 3.3, 0.2, std("#cfc8bb", 0.9), (ROLL_X0 + ROLL_X1) / 2, 3.3, -0.1);
  rects.push([PART_X, -0.2, ROLL_X0, 0.1], [ROLL_X1, -0.2, X1, 0.1]);
  const dock = toObject(dockModel());
  dock.position.set((PART_X + X1) / 2, 0, Z0 / 2);
  scene.add(dock);
  // a truck from the Proof Factory backed up to the dock, its doors open
  const truck = toObject(truckRearModel());
  truck.position.set((ROLL_X0 + ROLL_X1) / 2, 0, 2.6);
  scene.add(truck);
  const stencil = textPlane("搬入口 LOADING DOCK", { h: 0.24, color: "#141218", bg: "#f4c020" });
  stencil.position.set((ROLL_X0 + ROLL_X1) / 2, 3.55, -0.22);
  stencil.rotation.y = Math.PI;
  scene.add(stencil);
  // the dock is for trucks and hands: a chain across the open door
  rects.push([ROLL_X0, -0.3, ROLL_X1, 0.1]);

  // ---- the partition: glazed above a low wall, open where the conveyor comes through --------------
  const lowWall = std("#cfc8bb", 0.9);
  for (const [z0, z1] of [
    [PASS_Z1, 0],
    [Z0, PASS_Z0],
  ]) {
    box(scene, 0.2, 1.1, z1 - z0, lowWall, PART_X, 0, (z0 + z1) / 2);
    box(scene, 0.06, 2.3, z1 - z0, glass, PART_X, 1.1, (z0 + z1) / 2);
    box(scene, 0.22, 0.1, z1 - z0, mullion, PART_X, 1.1, (z0 + z1) / 2);
    rects.push([PART_X - 0.12, z0, PART_X + 0.12, z1]);
  }
  box(scene, 0.24, ROOF - 3.4, -Z0, std("#e6e1d6", 0.9), PART_X, 3.4, Z0 / 2);
  box(scene, 0.26, 0.1, -Z0, glowMat("#ff9f2e", 1.3), PART_X, 3.42, Z0 / 2);
  const passSign = textPlane("搬入 → 受取", { h: 0.26, color: "#141218", bg: "#3ec9b0" });
  passSign.position.set(PART_X - 0.14, 3.0, (PASS_Z0 + PASS_Z1) / 2);
  passSign.rotation.y = -Math.PI / 2;
  scene.add(passSign);

  // ---- the hall: the pickup table, the queue, the lockers, the board -------------------------------
  const table = toObject(pickupTableModel());
  table.position.set(TABLE_X, 0, TABLE_Z);
  scene.add(table);
  rects.push([TABLE_X - 4.1, TABLE_Z - 0.62, TABLE_X + 4.1, TABLE_Z + 0.62]);
  const sign = textPlane("受取 · PICKUP · PENDING TX", { h: 0.2, color: "#0d0d0d", bg: "#3ec9b0" });
  sign.position.set(TABLE_X, 3.1, TABLE_Z + 0.1);
  scene.add(sign);
  for (const x of [-1.4, 1.4]) box(scene, 0.02, ROOF - 3.25, 0.02, mullion, TABLE_X + x, 3.25, TABLE_Z + 0.1);
  const hall = toObject(hallModel());
  hall.position.set((X0 + PART_X) / 2, 0, Z0 / 2);
  scene.add(hall);
  // the lockers on the back wall, the stanchions, the ATM and the bench by the window
  rects.push([X0, Z0, -4.6, Z0 + 0.7], [X0, -3.2, X0 + 0.7, -1.2], [X0, -1.0, X0 + 2.4, -0.4]);
  const parcels = new Parcels(ctx, scene, tableSlot);
  pickables.push(parcels.group);
  ticks.push(() => parcels.sync());
  // memes on the hall's walls: back wall by the partition, side wall above the queue's end
  for (const [x, y, z, ry, h] of [
    [2.35, 1.8, Z0 + 0.12, 0, 0.95],
    [X0 + 0.12, 1.75, -3.95, Math.PI / 2, 1.0],
  ]) {
    const p = memePoster(nextMeme(), h, { kind: "frame", frame: "#ff9f2e" });
    p.position.set(x, y, z);
    p.rotation.y = ry;
    scene.add(p);
  }
  const board = liveBoard(ctx);
  board.mesh.position.set(-0.6, 2.6, Z0 + 0.15);
  scene.add(board.mesh);
  pickables.push(board.mesh);
  ticks.push(board.tick);

  // ---- the conveyor: parcels riding it from the roller door to the pass ----------------------------
  const lengths = BELT.slice(1).map((p, i) => p.distanceTo(BELT[i]));
  const beltLen = lengths.reduce((a, b) => a + b, 0);
  const along = (u: number, out: THREE.Vector3) => {
    let d = ((u % beltLen) + beltLen) % beltLen;
    for (let i = 0; i < lengths.length; i++) {
      if (d <= lengths[i]) return out.lerpVectors(BELT[i], BELT[i + 1], d / lengths[i]);
      d -= lengths[i];
    }
    return out.copy(BELT[BELT.length - 1]);
  };
  const N_BOX = 11;
  const riding = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.28, 0.34), parcelMaterial({ kind: "shielded" } as Tx)[0], N_BOX);
  scene.add(riding);
  const m4 = new THREE.Matrix4(),
    at = new THREE.Vector3();
  let beltT = 0;
  rects.push([6.6, -8.0, 7.4, -0.6], [1.2, -8.0, 7.4, -7.2]);

  // light: three over the hall, two over the dock (the board and the neon do the rest)
  for (const [x, y, z, c, i] of [
    [-7, 4.6, -3, "#fff4e0", 7],
    [-1.5, 4.6, -3, "#fff4e0", 7],
    [-4, 4.6, -10, "#cfe8ff", 6],
    [6.5, 4.4, -3, "#ffd9a0", 7],
    [6.5, 4.4, -10.5, "#ffd9a0", 6],
  ] as const) {
    const l = new THREE.PointLight(c, i, 14, 1.6);
    l.position.set(x, y, z);
    scene.add(l);
  }

  // ---- people: the shopkeeper behind the table, two dock hands -------------------------------------
  const people: Snark[] = [];
  const person = async (id: number, role: string, at: THREE.Vector3, face: THREE.Vector3 | null) => {
    try {
      const s = new Snark(id, await loadArt(id));
      s.noClip = true;
      s.state = "resident";
      s.role = role;
      s.root.position.copy(at);
      s.faceDir = face;
      scene.add(s.root);
      people.push(s);
      return s;
    } catch {
      return null;
    }
  };
  void person(6221, "Shopkeeper", new THREE.Vector3(TABLE_X - 2.4, SHOP_Y, TABLE_Z - 1.0), new THREE.Vector3(0, 0, 1));
  /** A dock hand walking a loop with a parcel one way and empty-handed back. */
  const hand = async (id: number, from: THREE.Vector3[], to: THREE.Vector3[], faceTo: THREE.Vector3, delay: number) => {
    const s = await person(id, "Dock hand", from[from.length - 1], null);
    if (!s) return;
    await new Promise((r) => setTimeout(r, delay));
    for (;;) {
      const list = ctx.director.rackTxs();
      const tx = list.length ? list[Math.floor(Math.random() * list.length)] : null;
      if (tx) {
        s.setTxs([tx]);
        s.showParcels(true);
      }
      await s.walk(to, 1.2);
      s.faceDir = faceTo;
      await new Promise((r) => setTimeout(r, 900));
      s.showParcels(false);
      s.setTxs([]);
      s.faceDir = null;
      await s.walk(from, 1.3);
      s.faceDir = new THREE.Vector3(1, 0, 0);
      await new Promise((r) => setTimeout(r, 1800 + Math.random() * 2000));
      s.faceDir = null;
    }
  };
  // one takes the parcels off the end of the belt to the table, one feeds the belt from the pallets
  void hand(3301, [new THREE.Vector3(1.5, SHOP_Y, -6.7)], [new THREE.Vector3(0.9, SHOP_Y, -6.2)], new THREE.Vector3(-1, 0, 0), 600);
  void hand(4417, [new THREE.Vector3(8.6, SHOP_Y, -11.2)], [new THREE.Vector3(8.4, SHOP_Y, -9), new THREE.Vector3(7.9, SHOP_Y, -5.2)], new THREE.Vector3(-1, 0, 0), 2400);

  // ---- the live street, replayed in here: drivers bring parcels in, zkSNARKs collect them -------------
  /** Last frame drawn in here: visits are replayed only while someone is watching. */
  let seen = 0;
  let visiting = 0;
  const DOOR_IN = new THREE.Vector3(DOOR_X, SHOP_Y, 0.9),
    DOOR = new THREE.Vector3(DOOR_X, SHOP_Y, -0.8);
  /** Drivers: in through the roller door, past the belt, through the pass to the table's end. */
  const DOCK_IN = [new THREE.Vector3(6.0, SHOP_Y, 1.0), new THREE.Vector3(6.0, SHOP_Y, -3.2), new THREE.Vector3(4.6, SHOP_Y, -6.3), new THREE.Vector3(1.0, SHOP_Y, -6.3), new THREE.Vector3(0.8, SHOP_Y, -5.6)];
  /** In through the door, to the table in front of the parcel. */
  const toTable = (x: number) => [DOOR, new THREE.Vector3(THREE.MathUtils.clamp(x, TABLE_X - 3.8, TABLE_X + 3.8), SHOP_Y, TABLE_Z + 0.95)];
  ctx.director.onShopVisit(async (v) => {
    if (performance.now() - seen > 600 || visiting >= 8) return;
    visiting++;
    const pickup = v.kind === "pickup";
    if (pickup) parcels.held.set(v.tx.txid, v.tx);
    else parcels.incoming.add(v.tx.txid);
    let s: Snark | null = null;
    try {
      s = new Snark(v.id, await loadArt(v.id));
      s.noClip = true;
      s.state = "resident";
      s.role = v.role;
      s.setTxs([v.tx]);
      s.showParcels(!pickup);
      s.root.position.copy(pickup ? DOOR_IN : DOCK_IN[0]);
      scene.add(s.root);
      people.push(s);
      const spot = pickup ? parcels.where(v.tx.txid) : null;
      await s.walk(pickup ? toTable(spot ? spot.x : TABLE_X - 3 + Math.random() * 6) : DOCK_IN.slice(1), pickup ? 1.4 : 1.6);
      s.faceDir = new THREE.Vector3(pickup ? 0 : -1, 0, pickup ? -1 : 0);
      await new Promise((r) => setTimeout(r, 450));
      // take the parcel off the table, or set it down
      if (pickup) parcels.held.delete(v.tx.txid);
      else parcels.incoming.delete(v.tx.txid);
      parcels.sync();
      s.showParcels(pickup);
      await new Promise((r) => setTimeout(r, 350));
      s.faceDir = null;
      await s.walk(pickup ? [DOOR, DOOR_IN] : [...DOCK_IN].reverse().slice(1), pickup ? 1.5 : 1.7);
    } catch {
      parcels.held.delete(v.tx.txid);
      parcels.incoming.delete(v.tx.txid);
    } finally {
      visiting--;
      if (s) {
        scene.remove(s.root);
        people.splice(people.indexOf(s), 1);
      }
    }
  });

  const archive = buildArchive(ctx, scene, ARCHIVE_Y);
  let floor = 0;
  archive.setActive(false);

  const camQuat = new THREE.Quaternion();
  const camRight = new THREE.Vector3();
  let acc = 0;
  return {
    key: "mempool",
    title: "MEMPOOL HQ",
    scene,
    floors: [{ label: "G", name: "Pickup hall · loading dock", y: SHOP_Y, spawn: new THREE.Vector3(DOOR_X, SHOP_Y, -0.9), yaw: 0 }, archive.floor],
    colliders: (f) => (f === 1 ? archive.rects : rects),
    pickables: () => (floor === 1 ? archive.pickables : pickables),
    pick: (hit) => (floor === 1 ? archive.pick(hit) : (parcels.pick(hit) ?? (hit.object === board.mesh ? board.info() : null))),
    hover: (hit) => (floor === 1 ? archive.hover(hit) : (parcels.hover(hit) ?? (hit.object === board.mesh ? "<b>Mempool board</b><span>live</span>" : null))),
    setFloor(f) {
      floor = f;
      archive.setActive(f === 1);
    },
    update(dt, t, camera) {
      if (floor === 1) return archive.update(dt);
      seen = performance.now();
      camera.getWorldQuaternion(camQuat);
      camRight.set(1, 0, 0).applyQuaternion(camQuat);
      for (const s of people) s.update(dt, t, camQuat, camRight);
      // the belt keeps running; a box rides it for every few pending transactions
      beltT += dt * 0.55;
      const shown = Math.min(N_BOX, 3 + Math.ceil(ctx.director.mempoolList().length / 3));
      for (let i = 0; i < N_BOX; i++) {
        along(beltT + (i * beltLen) / N_BOX, at);
        m4.makeTranslation(at.x, at.y + 0.14, at.z);
        if (i >= shown) m4.makeScale(0, 0, 0);
        riding.setMatrixAt(i, m4);
      }
      riding.instanceMatrix.needsUpdate = true;
      acc += dt;
      if (acc > 0.5) {
        acc = 0;
        for (const k of ticks) k(dt, t);
      }
    },
  };
}

// ---- parcels: the pending transactions ---------------------------------------------------------

/** One parcel per delivered transaction on the pickup table, kept in step with the street's rack. */
class Parcels {
  readonly group = new THREE.Group();
  private byTx = new Map<string, THREE.Mesh>();
  /** Collected outside already, but its zkSNARK is still walking to the wall in here. */
  readonly held = new Map<string, Tx>();
  /** On the rack outside, but its driver is still carrying it in here. */
  readonly incoming = new Set<string>();
  private geo = new THREE.BoxGeometry(0.34, 0.3, 0.34);

  constructor(
    private ctx: InteriorContext,
    parent: THREE.Object3D,
    private slot: (i: number) => THREE.Vector3,
  ) {
    parent.add(this.group);
    this.sync();
  }

  sync() {
    const rack = this.ctx.director.rackTxs().filter((t) => !this.incoming.has(t.txid));
    const txs = [...rack, ...[...this.held.values()].filter((t) => !rack.includes(t))].slice(-72);
    const keep = new Set(txs.map((t) => t.txid));
    for (const [id, m] of this.byTx)
      if (!keep.has(id)) {
        this.group.remove(m);
        this.byTx.delete(id);
      }
    txs.forEach((t, i) => {
      let m = this.byTx.get(t.txid);
      if (!m) {
        m = new THREE.Mesh(this.geo, parcelMaterial(t));
        m.userData.tx = t;
        this.byTx.set(t.txid, m);
        this.group.add(m);
      }
      m.position.copy(this.slot(i));
    });
  }

  /** Where a parcel sits on the wall (null if it isn't there). */
  where(txid: string) {
    return this.byTx.get(txid)?.position ?? null;
  }

  private at(hit: THREE.Intersection): Tx | undefined {
    return hit.object.parent === this.group ? (hit.object.userData.tx as Tx) : undefined;
  }

  hover(hit: THREE.Intersection) {
    const t = this.at(hit);
    return t ? `<b>${short(t.txid)}</b><span>${KIND_LABEL[t.kind]} · waiting ${ago(t.seenAt)}</span>` : null;
  }

  pick(hit: THREE.Intersection): PickInfo | null {
    const t = this.at(hit);
    if (!t) return null;
    const carrier = this.ctx.director.snarkOf(t.txid);
    return {
      eyebrow: "Parcel · pending transaction",
      title: short(t.txid),
      mono: true,
      tag: [KIND_LABEL[t.kind], "info"],
      stats: [
        ["Fee", t.fee == null ? "—" : zec(t.fee, 6).replace(" ZEC", "")],
        ["Actions", String(t.actions)],
        ["Size", `${(t.size / 1000).toFixed(1)} kB`],
        ["Waiting", ago(t.seenAt)],
      ],
      body: `<div class="note">${esc(KIND_HELP[t.kind])}.${t.transparentOut ? ` Public outputs: ${zec(t.transparentOut, 4)}.` : ""}${carrier ? ` zkSNARK #${num(carrier.id)} is carrying it to the bus stop.` : " Waiting for a zkSNARK to pick it up."}</div>`,
      link: { href: links.tx(t.txid), label: "Transaction on ZScan" },
    };
  }
}

const parcelMats = new Map<string, THREE.Material[]>();
function parcelMaterial(t: Tx) {
  let m = parcelMats.get(t.kind);
  if (!m) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    g.fillStyle = "#c8a070";
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = KIND_COLOR[t.kind];
    g.fillRect(0, 26, 64, 12);
    g.fillRect(26, 0, 12, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
    m = [mat, mat, mat, mat, mat, mat];
    parcelMats.set(t.kind, m);
  }
  return m;
}

// ---- the live board -------------------------------------------------------------------------------

function liveBoard(ctx: InteriorContext) {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 512;
  const g = c.getContext("2d")!;
  g.scale(2, 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 2.8), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  const mono = (px: number, w = 600) => `${w} ${px}px "JetBrains Mono", Menlo, monospace`;
  const stats = () => {
    const txs = ctx.director.mempoolList();
    return { txs, fees: txs.reduce((a, t) => a + (t.fee ?? 0), 0) };
  };
  return {
    mesh,
    tick() {
      const { txs, fees } = stats();
      g.fillStyle = "#06070a";
      g.fillRect(0, 0, 512, 256);
      g.fillStyle = "#ff9f2e";
      g.font = mono(18);
      fitText(g, "MEMPOOL · WAITING FOR A BLOCK", 20, 34);
      g.fillStyle = "#ffffff";
      g.font = mono(76, 800);
      const cw = fitText(g, String(txs.length), 20, 118, 200);
      g.fillStyle = "#9a9a9a";
      g.font = mono(18);
      fitText(g, `tx · ${(fees / 1e8).toFixed(5)} ZEC in fees`, 34 + cw, 116);
      // kinds as a stacked bar
      const kinds = ["shielded", "migration", "shielding", "deshielding", "transparent", "mixed"] as const;
      let x = 20;
      for (const k of kinds) {
        const n = txs.filter((t) => t.kind === k).length;
        if (!n) continue;
        const w = (n / Math.max(1, txs.length)) * 472;
        g.fillStyle = KIND_COLOR[k];
        g.fillRect(x, 140, w - 2, 18);
        x += w;
      }
      g.font = mono(14, 500);
      let ly = 186;
      for (const t of txs.slice(-3).reverse()) {
        g.fillStyle = KIND_COLOR[t.kind];
        g.fillRect(20, ly - 10, 10, 10);
        g.fillStyle = "#d0d0d0";
        fitText(g, `${short(t.txid)}  ${KIND_LABEL[t.kind].padEnd(12)} ${ago(t.seenAt)}`, 38, ly);
        ly += 22;
      }
      g.fillStyle = "rgba(0,0,0,0.18)";
      for (let y = 0; y < 256; y += 3) g.fillRect(0, y, 512, 1);
      tex.needsUpdate = true;
    },
    info(): PickInfo {
      const { txs, fees } = stats();
      return {
        eyebrow: "Mempool · live",
        title: `${txs.length} pending`,
        tag: ["Waiting for the next block", "warn"],
        stats: [
          ["Pending", String(txs.length)],
          ["Fees", (fees / 1e8).toFixed(5)],
          ["Oldest", txs[0] ? ago(txs[0].seenAt) : "—"],
          ["Shielded", txs.length ? `${Math.round((txs.filter((t) => t.kind === "shielded" || t.kind === "migration").length / txs.length) * 100)}%` : "—"],
        ],
        body: `<div class="note">Each transaction is a parcel on the pickup table. A truck driver brings it in, a zkSNARK collects it and waits at the bus stop for the next block.</div>`,
        link: { href: "https://zscan.cash/mempool", label: "Mempool on ZScan" },
      };
    },
  };
}

// ---- voxel furniture ------------------------------------------------------------------------------





/** Shop floor tiles, light with a faint grout. */
function tileTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#bdb8ae";
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = "#a8a39a";
  for (let i = 0; i < 128; i += 32) {
    g.fillRect(i, 0, 2, 128);
    g.fillRect(0, i, 128, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(10, 8);
  return t;
}


/** The pickup table: 8 m of dark wood with a pale top, an orange neon strip and a till at one end. */
function pickupTableModel() {
  const m = new VoxelModel(50, 7, 8);
  m.box(1, 0, 0, 49, 5, 8, shades(["#5a4a3c", "#544536", "#604e40"], 1, 3));
  m.box(0, 5, 0, 50, 6, 8, C("#e8e2d4"));
  // the neon strip along the customers' side and a kick plate
  m.box(1, 4, 7, 49, 5, 8, E("#ff9f2e", 0.9));
  m.box(1, 0, 7, 49, 1, 8, C("#2a2620"));
  // the till and its screen on the shopkeeper's end
  m.box(44, 6, 1, 48, 7, 4, C("#2a2a30"));
  m.set(46, 6, 4, E("#59e3ff", 1.2));
  return m;
}

const KRAFT = shades(["#c8955a", "#bd8a50", "#d29e62", "#b98348"], 1, 41);
/** A parcel with the chain's tape (orange or teal) across its front and top. */
function parcelVox(m: VoxelModel, x: number, y: number, z: number, w: number, h: number, d: number, tape = "#ff9f2e") {
  m.box(x, y, z, x + w, y + h, z + d, KRAFT);
  const tx = x + Math.floor(w / 2);
  m.box(tx, y, z + d - 1, tx + 1, y + h, z + d, C(tape));
  m.box(tx, y + h - 1, z, tx + 1, y + h, z + d, C(tape));
}
function palletVox(m: VoxelModel, x: number, z: number, w = 7, d = 7) {
  for (const k of [0, Math.floor(d / 2), d - 1]) m.box(x, 0, z + k, x + w, 1, z + k + 1, C("#8a6440"));
  for (let xx = x; xx < x + w; xx += 2) m.box(xx, 1, z, xx + 1, 2, z + d, C("#9a7450"));
}
const hazard = (x: number, y: number) => (Math.floor((x + y) / 2) % 2 ? C("#f4c020") : C("#1c1a20"));

/** The loading dock (x 1…10, z −14…0 in the room; 1 voxel = 1/6 m): belt, racking, pallets, forklift, roller door. */
function dockModel() {
  const W = 54,
    D = 84;
  const m = new VoxelModel(W, 31, D);
  const vx = (x: number) => Math.round((x - 1) * 6),
    vz = (z: number) => Math.round((z + 14) * 6);
  // the conveyor: legs, frame, rubber belt, yellow rails (along z by the door, along x to the pass)
  const belt = (x0: number, z0: number, x1: number, z1: number) => {
    m.box(x0, 3, z0, x1, 4, z1, C("#4a4852"));
    m.box(x0, 4, z0, x1, 5, z1, (x, _y, z) => ((x + z) % 3 ? C("#26242c") : C("#34323a")));
    const along = x1 - x0 > z1 - z0;
    if (along) {
      m.box(x0, 4, z0, x1, 6, z0 + 1, C("#f4c020"));
      m.box(x0, 4, z1 - 1, x1, 6, z1, C("#f4c020"));
      for (let x = x0 + 1; x < x1; x += 8) m.box(x, 0, z0, x + 1, 3, z1, C("#5a5864"));
    } else {
      m.box(x0, 4, z0, x0 + 1, 6, z1, C("#f4c020"));
      m.box(x1 - 1, 4, z0, x1, 6, z1, C("#f4c020"));
      for (let z = z0 + 1; z < z1; z += 8) m.box(x0, 0, z, x1, 3, z + 1, C("#5a5864"));
    }
  };
  belt(vx(6.6), vz(-8.0), vx(7.4), vz(-0.6));
  belt(vx(1.2), vz(-8.0), vx(7.4), vz(-7.2));
  // the belt's motor box and an emergency stop
  m.box(vx(7.4), 0, vz(-1.6), vx(7.9), 7, vz(-0.8), C("#3a5a8a"));
  m.box(vx(7.5), 7, vz(-1.4), vx(7.8), 8, vz(-1.1), E("#ff3048", 1.6));
  // racking down the right wall, three levels of parcels
  const rx0 = vx(9),
    rx1 = vx(10);
  for (const y of [0, 9, 18]) {
    m.box(rx0, y + 1, vz(-13), rx1, y + 2, vz(-2), C("#2c5aa0"));
    for (let z = vz(-13) + 1; z < vz(-2) - 4; z += 5) if ((z * 7 + y) % 5) parcelVox(m, rx0 + 1, y + 2, z, 4, y < 18 ? 5 : 4, 4, (z + y) % 3 ? "#ff9f2e" : "#3ec9b0");
  }
  for (let z = vz(-13); z <= vz(-2); z += 11) m.box(rx0, 0, z, rx1, 27, z + 1, C("#e07a1a"));
  // pallets: three by the back wall, one by the door, stacked high
  for (const [x, z, n] of [
    [4.2, -13.4, 3],
    [5.6, -13.4, 2],
    [7.4, -12.4, 3],
    [8.0, -4.0, 2],
  ] as const) {
    const px = vx(x),
      pz = vz(z);
    palletVox(m, px, pz);
    for (let k = 0; k < n; k++) {
      parcelVox(m, px, 2 + k * 4, pz, 3, 4, 3, k % 2 ? "#3ec9b0" : "#ff9f2e");
      parcelVox(m, px + 4, 2 + k * 4, pz, 3, 4, 3);
      parcelVox(m, px, 2 + k * 4, pz + 4, 3, 4, 3);
      if (k < n - 1) parcelVox(m, px + 4, 2 + k * 4, pz + 4, 3, 4, 3, "#3ec9b0");
    }
    // stretch wrap catching the light
    m.box(px - 0.4, 2, pz + 7, px + 7, 2 + n * 4 - 1, pz + 7.4, G("#dfe8f0"));
  }
  // the forklift: yellow body, black mast and forks, a seat, an orange light
  const fx = vx(4.4),
    fz = vz(-11.2);
  m.box(fx, 1, fz, fx + 6, 5, fz + 8, C("#f4b728"));
  m.box(fx + 1, 5, fz + 3, fx + 5, 7, fz + 6, C("#1c1a20"));
  m.box(fx, 5, fz, fx + 1, 12, fz + 1, C("#2a2830"));
  m.box(fx + 5, 5, fz, fx + 6, 12, fz + 1, C("#2a2830"));
  m.box(fx, 12, fz, fx + 6, 13, fz + 6, C("#2a2830"));
  m.box(fx + 2, 13, fz + 2, fx + 4, 14, fz + 4, E("#ff9f2e", 1.8));
  m.box(fx, 5, fz + 7, fx + 6, 14, fz + 8, C("#2a2830"));
  m.box(fx + 1, 0, fz + 8, fx + 2, 1, fz + 13, C("#3a3842"));
  m.box(fx + 4, 0, fz + 8, fx + 5, 1, fz + 13, C("#3a3842"));
  for (const [x, z] of [
    [fx - 0.5, fz + 1],
    [fx + 5.5, fz + 1],
    [fx - 0.5, fz + 5],
    [fx + 5.5, fz + 5],
  ])
    m.box(x, 0, z, x + 1, 2, z + 2, C("#141218"));
  // the dock desk by the partition: a scanner, a screen, a label printer
  m.box(vx(3.3), 0, vz(-3.9), vx(4.4), 6, vz(-2.6), C("#5a5864"));
  m.box(vx(3.3), 6, vz(-3.9), vx(4.4), 7, vz(-2.6), C("#d8d4cc"));
  m.box(vx(3.5), 7, vz(-3.6), vx(3.8), 10, vz(-3.3), C("#2a2830"));
  m.box(vx(3.5), 9, vz(-3.7), vx(3.8), 10, vz(-3.1), E("#59e3ff", 1.2));
  m.box(vx(4.0), 7, vz(-3.3), vx(4.3), 8, vz(-2.9), C("#e8e8f0"));
  // the roller door's frame: hazard posts and header, the shutter rolled up under its drum
  const dx0 = vx(4.8),
    dx1 = vx(9.2),
    fzD = D - 1;
  m.box(dx0 - 1, 0, fzD - 1, dx0, 20, D, hazard);
  m.box(dx1, 0, fzD - 1, dx1 + 1, 20, D, hazard);
  m.box(dx0 - 1, 20, fzD - 1, dx1 + 1, 21, D, hazard);
  m.box(dx0, 16, fzD - 2, dx1, 20, fzD - 1, (_x, y) => (y % 2 ? C("#9aa0aa") : C("#7a808a")));
  m.box(dx0 - 1, 20, fzD - 3, dx1 + 1, 22, fzD - 1, C("#5a5864"));
  for (const x of [dx0, dx1 - 2]) m.box(x, 1, fzD - 1, x + 2, 4, D, C("#18161c"));
  // a floor-level chain across the door, on two posts
  for (const x of [dx0 + 1, dx1 - 2]) m.box(x, 0, fzD - 3, x + 1, 5, fzD - 2, C("#f4c020"));
  m.box(dx0 + 1, 4, fzD - 3, dx1 - 1, 4.4, fzD - 2.6, C("#d8d4cc"));
  return m;
}

/** The hall's furniture (x −10…3, z −14…0): lockers, a queue line, the ATM, a bench, plants. */
function hallModel() {
  const W = 78,
    D = 84;
  const m = new VoxelModel(W, 31, D);
  const vx = (x: number) => Math.round((x + 10) * 6),
    vz = (z: number) => Math.round((z + 14) * 6);
  // pickup lockers along the back wall: orange doors, a dark keypad each, a teal band on top
  for (let x = 0; x < vx(-4.6); x += 4)
    for (let y = 0; y < 18; y += 4) {
      m.box(x, y, 0, x + 4, y + 4, 4, C(y % 8 ? "#e08a2a" : "#ea9636"));
      m.box(x, y, 4, x + 4, y + 0.4, 4.4, C("#b86a1a"));
      m.set(x + 3, y + 2, 4, C("#2a2830"));
    }
  m.box(0, 18, 0, vx(-4.6), 20, 5, C("#3ec9b0"));
  for (let x = 2; x < vx(-4.6); x += 8) m.box(x, 15, 4, x + 3, 16, 4.6, E("#9ff0e0", 1.2));
  // the queue: brass posts, red ropes, in front of the table
  for (let x = vx(-7.4); x <= vx(-0.4); x += 7) {
    m.box(x, 0, vz(-3.4), x + 1, 6, vz(-3.4) + 1, C("#c9a227"));
    m.box(x - 0.5, 0, vz(-3.4) - 0.5, x + 1.5, 0.5, vz(-3.4) + 1.5, C("#3a3842"));
    m.set(x, 6, vz(-3.4), C("#e8c050"));
    if (x + 7 <= vx(-0.4)) m.box(x + 1, 4.5, vz(-3.4), x + 7, 5, vz(-3.4) + 0.6, C("#c0303a"));
  }
  // the ATM by the window, a bench and two potted palms
  m.box(0, 0, vz(-3.2), 4, 12, vz(-1.2), C("#3a5a8a"));
  m.box(4, 7, vz(-2.8), 4.4, 10, vz(-1.6), E("#9fd8ff", 1.2));
  m.box(3, 5, vz(-2.8), 4.6, 6, vz(-1.6), C("#2a2830"));
  m.box(0, 0, vz(-1.0), vx(-7.6), 3, vz(-0.4), C("#6a5a4a"));
  m.box(0, 3, vz(-1.0), vx(-7.6), 3.5, vz(-0.4), C("#e8e2d4"));
  for (const [x, z] of [
    [-9.3, -12.4],
    [2.2, -0.9],
  ] as const) {
    m.box(vx(x) - 2, 0, vz(z) - 2, vx(x) + 2, 4, vz(z) + 2, C("#e8e4dc"));
    m.box(vx(x) - 0.5, 4, vz(z) - 0.5, vx(x) + 0.5, 12, vz(z) + 0.5, C("#6a4a30"));
    m.blob(vx(x), 14, vz(z), 4, shades(["#2f6b3c", "#3d8a4a", "#285c33"], 1, x), 0.4, Math.abs(x * 10));
  }
  // block shelves on the left wall: recent blocks as boxes, the chain's colours under each board
  for (const y of [3, 9, 15]) {
    m.box(0, y, vz(-11.6), 3, y + 1, vz(-4.6), C("#6a6774"));
    m.box(3, y, vz(-11.6), 3.4, y + 1, vz(-4.6), E("#ff9f2e", 0.8));
    for (let z = vz(-11.4); z < vz(-4.8); z += 3) m.box(0.5, y + 1, z, 2.5, y + 3, z + 2, C(["#3a7bff", "#f4b728", "#5cff9a", "#ff3e8a", "#b07bff"][(z + y) % 5]));
  }
  return m;
}

/** The back of a delivery truck at the roller door: doors swung open, parcels stacked inside. */
function truckRearModel() {
  const W = 24,
    D = 26,
    H = 19;
  const m = new VoxelModel(W, H, D);
  const x0 = 5,
    x1 = 19;
  // the box body (open towards −z, the dock), orange with a white band
  m.box(x0, 3, 0, x1, H - 1, D - 4, C("#e07a1a"));
  m.box(x0, 9, 0, x1, 11, D - 4, C("#f0ece4"));
  m.clear(x0 + 1, 4, 0, x1 - 1, H - 2, D - 6);
  m.box(x0 + 1, 3, 0, x1 - 1, 4, D - 6, C("#8a8890"));
  for (let z = 2; z < D - 8; z += 4)
    for (let y = 4; y < H - 6; y += 4) {
      parcelVox(m, x0 + 2, y, z, 4, 4, 3, (y + z) % 3 ? "#ff9f2e" : "#3ec9b0");
      if ((y + z) % 5) parcelVox(m, x1 - 6, y, z, 4, 4, 3);
    }
  m.box(x0 + 1, H - 2, 0, x1 - 1, H - 1.6, D - 6, E("#fff0d0", 1.0));
  // the doors swung open against the sides, the bumper, the lights
  m.box(x0 - 7, 3, 0, x0, H - 1, 1, C("#d86a10"));
  m.box(x1, 3, 0, x1 + 5, H - 1, 1, C("#d86a10"));
  m.box(x0, 2, 0, x1, 3, 1, C("#1c1a20"));
  for (const x of [x0, x1 - 2]) m.box(x, 4, 0, x + 2, 6, 0.4, E("#ff3048", 1.5));
  // wheels and the cab's back (the rest is out in the street)
  for (const z of [5, 17]) {
    m.box(x0 - 1, 0, z, x0 + 2, 3, z + 3, C("#141218"));
    m.box(x1 - 2, 0, z, x1 + 1, 3, z + 3, C("#141218"));
  }
  m.box(x0, 3, D - 4, x1, H - 4, D, C("#f0ece4"));
  return m;
}

/** The dock floor: sealed concrete, yellow lane lines, hatched no-go by the door. */
function concreteTexture() {
  const c = document.createElement("canvas");
  c.width = 448;
  c.height = 896;
  const g = c.getContext("2d")!;
  g.fillStyle = "#8a8890";
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 2400; i++) {
    g.fillStyle = `rgba(${Math.random() > 0.5 ? "255,255,255" : "0,0,0"},0.05)`;
    g.fillRect(Math.random() * c.width, Math.random() * c.height, 3, 3);
  }
  g.strokeStyle = "rgba(0,0,0,0.18)";
  for (let y = 0; y < c.height; y += 192) g.strokeRect(0, y, c.width, 192);
  // a walkway lane along the partition and round the belt (64 px = 1 m)
  g.fillStyle = "#f4c020";
  g.fillRect(64, 0, 10, c.height);
  g.fillRect(0, 380, c.width, 10);
  // hatched apron inside the roller door
  for (let x = 110; x < 400; x += 24) {
    g.save();
    g.beginPath();
    g.rect(110, c.height - 96, 290, 90);
    g.clip();
    g.fillRect(x, c.height - 96, 10, 96);
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
