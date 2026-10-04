import * as THREE from "three";
import type { BlockSummary, Tx } from "../data/types";
import { KIND_HELP, KIND_LABEL } from "../data/types";
import { get, links } from "../data/zscan";
import { KIND_COLOR, Snark, loadArt } from "../scene/snark";
import { fitText } from "../scene/fit";
import { toObject } from "../scene/voxel/mesher";
import { C, E, G, shades, VoxelModel } from "../scene/voxel/model";
import { box, glowMat, makeScene, room, std, textPlane } from "./kit";
import type { Interior, InteriorContext, PickInfo, Rect } from "./types";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const num = (n: number) => n.toLocaleString("en-US");
const zec = (zat: number, d = 5) => `${(zat / 1e8).toLocaleString("en-US", { minimumFractionDigits: Math.min(2, d), maximumFractionDigits: d })} ZEC`;
const short = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;
const ago = (ms: number) => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
};

/** The shop's aisles: one kind of block each, by what its transactions did. */
const AISLES = [
  { key: "shielded", label: "FULLY SHIELDED", color: "#3ee08f" },
  { key: "shielding", label: "SHIELDING", color: "#8f7bff" },
  { key: "deshielding", label: "DESHIELDING", color: "#ffcf4a" },
  { key: "transparent", label: "TRANSPARENT", color: "#ff9a3c" },
  { key: "mixed", label: "MIXED", color: "#7fd3ff" },
  { key: "empty", label: "EMPTY · COINBASE ONLY", color: "#9a96a6" },
] as const;

/** Which aisle a block goes on: the one kind it carried, or mixed. Migrations count as shielded. */
function aisleOf(b: BlockSummary, kinds: Set<string>): (typeof AISLES)[number]["key"] {
  if (b.tx_count <= 1 || !kinds.size) return "empty";
  const k = new Set([...kinds].map((x) => (x === "migration" ? "shielded" : x)));
  if (k.size > 1) return "mixed";
  const only = [...k][0];
  return only === "shielded" || only === "shielding" || only === "deshielding" || only === "transparent" ? only : "mixed";
}

/** Floor heights: the shop, and the archive upstairs. */
const SHOP_Y = 0;
const ARCHIVE_Y = 6;
/** Block boxes per board, boards per rack face. */
const PITCH = 0.46;

/**
 * Inside the MEMPOOL shop. Downstairs, the convenience store where zkSNARKs pick up transactions:
 * the pickup wall holds one parcel per pending transaction (live), the aisles keep the last
 * blocks, the board on the back wall shows the mempool. Upstairs, the archive: the last day of
 * blocks, a thousand boxes on tall racks.
 */
export function buildMempool(ctx: InteriorContext): Interior {
  const scene = makeScene(ctx.renderer, "#0d0c12");
  const pickables: THREE.Object3D[] = [];
  const shopRects: Rect[] = [];
  const archRects: Rect[] = [];
  const ticks: ((dt: number, t: number) => void)[] = [];

  // ---- the shop floor ------------------------------------------------------------------------
  const tile = tileTexture();
  shopRects.push(
    ...room(scene, {
      x0: -10,
      z0: -16,
      x1: 10,
      z1: 0,
      h: 4,
      floor: new THREE.MeshStandardMaterial({ map: tile, roughness: 0.35, metalness: 0.05 }),
      wall: std("#cfc8bb", 0.9),
      ceiling: std("#8f8a82", 0.9),
      open: true,
    }),
  );
  // the chain's stripes along the walls: orange over teal
  for (const [y, c] of [
    [3.3, "#ff9f2e"],
    [3.15, "#3ec9b0"],
  ] as const) {
    box(scene, 19.9, 0.1, 0.02, glowMat(c, 1.4), 0, y, -15.88);
    box(scene, 0.02, 0.1, 15.8, glowMat(c, 1.4), -9.88, y, -8);
    box(scene, 0.02, 0.1, 15.8, glowMat(c, 1.4), 9.88, y, -8);
  }
  // ceiling light panels
  const panel = glowMat("#f4f0e8", 1.05);
  for (let x = -7.5; x <= 7.5; x += 5) for (let z = -13; z <= -3; z += 4) box(scene, 2.2, 0.04, 0.6, panel, x, 3.94, z);
  // glass front with the door, the street glowing outside
  const glass = new THREE.MeshStandardMaterial({ color: "#7aa0c0", roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.35 });
  box(scene, 8.2, 3.2, 0.05, glass, -5.8, 0.1, -0.05);
  box(scene, 8.2, 3.2, 0.05, glass, 5.8, 0.1, -0.05);
  const mullion = std("#2a2830", 0.6, 0.4);
  for (const x of [-10, -6.8, -3.4, -1.7, 1.7, 3.4, 6.8, 10]) box(scene, 0.1, 3.4, 0.12, mullion, x, 0, -0.05);
  box(scene, 20, 0.6, 0.14, std("#e6e1d6", 0.9), 0, 3.4, -0.05);
  box(scene, 20, 0.1, 0.14, mullion, 0, 0, -0.05);
  const street = new THREE.Mesh(new THREE.PlaneGeometry(40, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color("#3a2a52").multiplyScalar(1.2) }));
  street.position.set(0, 2, 3);
  street.rotation.y = Math.PI;
  scene.add(street);
  const name = textPlane("MEMPOOL", { h: 0.7, color: "#ff9f2e", glow: true });
  name.position.set(0, 3.45, -0.12);
  name.rotation.y = Math.PI;
  scene.add(name);

  // fridges along the back wall, cool light
  const fridge = toObject(fridgeModel());
  for (let x = -8; x <= -1; x += 2.4) {
    const f = fridge.clone();
    f.position.set(x, 0, -15.3);
    scene.add(f);
  }
  shopRects.push([-9.3, -15.9, 0.4, -14.6]);

  // the board: live mempool on the back wall, right of the fridges
  const board = liveBoard(ctx);
  board.mesh.position.set(5.4, 2.1, -15.85);
  scene.add(board.mesh);
  pickables.push(board.mesh);
  ticks.push(board.tick);

  // aisles: three double-sided shelf runs holding the last blocks
  const shelf = shelfModel(22, 11);
  const runs = [-6.6, -2.6, 1.4];
  for (const x of runs) {
    const s = toObject(shelf);
    s.rotation.y = Math.PI / 2;
    s.position.set(x, 0, -8.6);
    scene.add(s);
    shopRects.push([x - 0.45, -12.4, x + 0.45, -4.8]);
  }
  const recent = new BlockBoxes(360);
  scene.add(recent.mesh);
  pickables.push(recent.mesh);
  // one shelf face per kind of block: six faces on three runs, newest at eye level by the aisle end
  const faces = AISLES.map((a, i) => {
    const x = runs[Math.floor(i / 2)],
      side = i % 2 ? 1 : -1;
    const slots: THREE.Vector3[] = [];
    for (const level of [2, 1, 3, 0]) for (let k = 0; k < 15; k++) slots.push(new THREE.Vector3(x + side * 0.28, 0.17 + level * 0.5, -5.2 - k * 0.48));
    // the aisle sign hangs over the face, readable from the entrance
    const l = textPlane(a.label, { h: 0.16, color: "#0d0d0d", bg: a.color });
    l.position.set(x + side * 0.42, 2.3, -4.62);
    l.scale.setScalar(Math.min(1, 0.78 / (l.geometry as THREE.PlaneGeometry).parameters.width));
    scene.add(l);
    return slots;
  });
  /** Blocks sorted onto their aisles; kinds of each block, as they become known. */
  const kindsOf = new Map<number, Set<string>>();
  const blocksSeen: BlockSummary[] = [];
  const sortShelves = () => {
    const blocks: BlockSummary[] = [],
      slots: THREE.Vector3[] = [];
    AISLES.forEach((a, i) => {
      const mine = blocksSeen.filter((b) => kindsOf.has(b.height) && aisleOf(b, kindsOf.get(b.height)!) === a.key).slice(0, faces[i].length);
      mine.forEach((b, k) => {
        blocks.push(b);
        slots.push(faces[i][k]);
      });
    });
    recent.fill(blocks, slots, (b) => AISLES.find((a) => a.key === aisleOf(b, kindsOf.get(b.height)!))!.color);
  };

  // the pickup counter, the till, and the wall of parcels behind it
  const counter = toObject(counterModel());
  counter.position.set(6.6, 0, -4.4);
  scene.add(counter);
  shopRects.push([4.6, -5.0, 8.6, -3.8]);
  const cubbies = toObject(cubbyModel());
  cubbies.position.set(9.55, 0, -8.5);
  cubbies.rotation.y = -Math.PI / 2;
  scene.add(cubbies);
  shopRects.push([8.9, -12.4, 9.9, -4.6]);
  const pickupSign = textPlane("PICKUP · PENDING TX", { h: 0.24, color: "#0d0d0d", bg: "#3ec9b0" });
  pickupSign.position.set(9.5, 3.0, -8.5);
  pickupSign.rotation.y = -Math.PI / 2;
  scene.add(pickupSign);
  // the pigeonholes, seen from the room: columns run along z, rows up the wall
  const parcels = new Parcels(ctx, scene, (col, row) => new THREE.Vector3(9.4, 0.17 + row * 0.517 + 0.16, -4.72 - col * 0.567));
  pickables.push(parcels.group);
  ticks.push(() => parcels.sync());

  // the stairs up to the archive (the elevator takes you there)
  const up = textPlane("ARCHIVE ↑ 1F", { h: 0.28, color: "#f4b728", glow: true });
  up.position.set(-9.85, 2.6, -2.6);
  up.rotation.y = Math.PI / 2;
  scene.add(up);

  // lights
  for (const [x, z, c, i] of [
    [-4, -8, "#fff4e0", 5],
    [5, -8, "#fff4e0", 5],
    [-4, -14, "#cfe8ff", 3],
  ] as const) {
    const l = new THREE.PointLight(c, i, 14, 1.6);
    l.position.set(x, 3.5, z);
    scene.add(l);
  }

  // ---- the archive upstairs -------------------------------------------------------------------
  archRects.push(
    ...room(scene, {
      x0: -14,
      z0: -32,
      x1: 14,
      z1: 0,
      y: ARCHIVE_Y,
      h: 6,
      floor: std("#3a3740", 0.85),
      wall: std("#2a2830", 0.9),
      ceiling: std("#16151b", 0.9),
    }),
  );
  const rack = rackModel(26, 16);
  const rackX = [-8, -3, 3, 8];
  for (const x of rackX) {
    const r = toObject(rack);
    r.rotation.y = Math.PI / 2;
    r.position.set(x, ARCHIVE_Y, -16);
    scene.add(r);
    archRects.push([x - 0.45, -29.2, x + 0.45, -2.8]);
    // aisle light overhead
    box(scene, 0.12, 0.04, 26, glowMat("#f4b728", 0.9), x + (x < 0 ? 2.5 : -2.5), ARCHIVE_Y + 5.9, -16);
  }
  const archive = new BlockBoxes(rackX.length * 2 * 5 * 56);
  archive.mesh.position.y = 0;
  scene.add(archive.mesh);
  pickables.push(archive.mesh);
  const archiveSlots: THREE.Vector3[] = [];
  // newest on the two racks either side of the central aisle, eye level first
  for (const x of [-3, 3, -8, 8])
    for (const side of [x < 0 ? 1 : -1, x < 0 ? -1 : 1])
      for (const level of [2, 3, 1, 4, 0])
        for (let k = 0; k < 56; k++) archiveSlots.push(new THREE.Vector3(x + side * 0.28, ARCHIVE_Y + 0.17 + level * 0.52, -3.2 - k * PITCH));
  const archTitle = textPlane("THE ARCHIVE · THE LAST 2,000 BLOCKS", { h: 0.42, color: "#f4b728", glow: true });
  archTitle.position.set(0, ARCHIVE_Y + 4.6, -31.85);
  scene.add(archTitle);
  for (const [x, z] of [
    [0, -8],
    [0, -22],
    [-5.5, -15],
    [5.5, -15],
  ]) {
    const l = new THREE.PointLight("#ffe2b0", 12, 16, 1.5);
    l.position.set(x, ARCHIVE_Y + 5, z);
    scene.add(l);
  }

  // ---- people: the shopkeeper, a customer browsing, the archivist upstairs --------------------
  const people: Snark[] = [];
  /** Wanderers change aisle by the cross aisle at `cross` (z), never through the shelves. */
  const addSnark = async (id: number, at: THREE.Vector3, role: string, wander?: THREE.Vector3[], cross = -3.8) => {
    try {
      const s = new Snark(id, await loadArt(id));
      s.noClip = true;
      s.state = "resident";
      s.role = role;
      s.root.position.copy(at);
      scene.add(s.root);
      people.push(s);
      if (wander)
        for (;;) {
          await new Promise((r) => setTimeout(r, 2500 + Math.random() * 5000));
          const to = wander[Math.floor(Math.random() * wander.length)];
          const from = s.root.position;
          const path = Math.abs(to.x - from.x) > 0.3 ? [new THREE.Vector3(from.x, to.y, cross), new THREE.Vector3(to.x, to.y, cross), to] : [to];
          await s.walk(path, 1);
        }
      else s.faceDir = new THREE.Vector3(0, 0, 1);
    } catch {}
  };
  void addSnark(6221, new THREE.Vector3(6.8, SHOP_Y, -6.2), "Shopkeeper");
  const aisleSpots = [-4.6, -0.6, 3.4].flatMap((x) => [-6, -9, -12].map((z) => new THREE.Vector3(x, SHOP_Y, z)));
  void addSnark(2967, aisleSpots[1], "Customer", aisleSpots);
  void addSnark(1, new THREE.Vector3(0, ARCHIVE_Y, -10), "Archivist", [-5.5, 0, 5.5].flatMap((x) => [-6, -14, -24].map((z) => new THREE.Vector3(x, ARCHIVE_Y, z))), -1.9);

  // ---- the live street, replayed in here: drivers bring parcels in, zkSNARKs collect them -------
  /** Last frame drawn in here: visits are replayed only while someone is watching. */
  let seen = 0;
  let visiting = 0;
  const DOOR_IN = new THREE.Vector3(0, SHOP_Y, 0.9),
    DOOR = new THREE.Vector3(0, SHOP_Y, -0.8);
  /** Round the west end of the counter to the pickup wall, standing just in front of it. */
  const toWall = (z: number) => [DOOR, new THREE.Vector3(4.1, SHOP_Y, -3.2), new THREE.Vector3(4.1, SHOP_Y, -5.7), new THREE.Vector3(8.7, SHOP_Y, THREE.MathUtils.clamp(z, -12, -5.2))];
  ctx.director.onShopVisit(async (v) => {
    if (performance.now() - seen > 600 || visiting >= 10) return;
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
      s.root.position.copy(DOOR_IN);
      scene.add(s.root);
      people.push(s);
      const at = pickup ? parcels.where(v.tx.txid) : null;
      const path = toWall(at ? at.z : -5.2 - Math.random() * 6);
      await s.walk(path, pickup ? 1.6 : 1.8);
      s.faceDir = new THREE.Vector3(1, 0, 0);
      await new Promise((r) => setTimeout(r, 450));
      // take the parcel off the wall, or put it on
      if (pickup) parcels.held.delete(v.tx.txid);
      else parcels.incoming.delete(v.tx.txid);
      parcels.sync();
      s.showParcels(pickup);
      await new Promise((r) => setTimeout(r, 350));
      s.faceDir = null;
      await s.walk([...path.slice(0, -1).reverse(), DOOR_IN], pickup ? 1.7 : 1.9);
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

  // ---- blocks: the last hundred and fifty downstairs, a thousand upstairs --------------------
  void (async () => {
    const all: BlockSummary[] = [];
    let before: number | undefined;
    for (let page = 0; page < 20; page++) {
      const b = await get<BlockSummary[]>(`/v1/blocks?limit=100${before ? `&before=${before}` : ""}`);
      if (!b?.length) break;
      all.push(...b);
      before = b[b.length - 1].height;
      archive.fill(all, archiveSlots);
      if (page === 2) void classify(all.slice(0, 300));
    }
  })();
  // what kinds of transaction each block carried, from the recent transactions list
  async function classify(blocks: BlockSummary[]) {
    blocksSeen.push(...blocks);
    const oldest = blocks[blocks.length - 1]?.height ?? 0;
    for (const b of blocks) if (b.tx_count <= 1) kindsOf.set(b.height, new Set());
    let before: number | undefined;
    for (let page = 0; page < 16; page++) {
      const txs = await get<{ height: number; kind: string }[]>(`/v1/txs?limit=100${before ? `&before=${before}` : ""}`);
      if (!txs?.length) break;
      for (const t of txs) {
        if (t.kind === "coinbase") continue;
        const k = kindsOf.get(t.height) ?? new Set<string>();
        k.add(t.kind);
        kindsOf.set(t.height, k);
      }
      before = txs[txs.length - 1].height;
      sortShelves();
      if (before < oldest) break;
    }
  }
  ctx.onBlock((height) => {
    void get<BlockSummary[]>("/v1/blocks?limit=1").then(async (b) => {
      if (!b?.[0] || b[0].height < height) return;
      archive.unshift(b[0], archiveSlots);
      const d = await get<{ txs: { kind: string }[] }>(`/v1/blocks/${b[0].height}`);
      kindsOf.set(b[0].height, new Set((d?.txs ?? []).map((t) => t.kind).filter((k) => k !== "coinbase")));
      blocksSeen.unshift(b[0]);
      sortShelves();
    });
  });

  const camQuat = new THREE.Quaternion();
  const camRight = new THREE.Vector3();
  let acc = 0;
  return {
    key: "mempool",
    title: "MEMPOOL",
    scene,
    floors: [
      { label: "G", name: "The shop · pending transactions", y: SHOP_Y, spawn: new THREE.Vector3(0, SHOP_Y, -1.4), yaw: 0 },
      { label: "1", name: "The archive · the last 2,000 blocks", y: ARCHIVE_Y, spawn: new THREE.Vector3(0, ARCHIVE_Y, -1.6), yaw: 0 },
    ],
    colliders: (f) => (f === 0 ? shopRects : archRects),
    pickables: () => pickables,
    pick: (hit) => recent.pick(hit) ?? archive.pick(hit) ?? parcels.pick(hit) ?? (hit.object === board.mesh ? board.info() : null),
    hover: (hit) => recent.hover(hit) ?? archive.hover(hit) ?? parcels.hover(hit) ?? (hit.object === board.mesh ? "<b>Mempool board</b><span>live</span>" : null),
    update(dt, t, camera) {
      seen = performance.now();
      camera.getWorldQuaternion(camQuat);
      camRight.set(1, 0, 0).applyQuaternion(camQuat);
      for (const s of people) s.update(dt, t, camQuat, camRight);
      acc += dt;
      if (acc > 0.5) {
        acc = 0;
        for (const k of ticks) k(dt, t);
      }
    },
  };
}

// ---- blocks on shelves --------------------------------------------------------------------------

/** One instanced box per block; size and colour follow how much it carried. */
class BlockBoxes {
  readonly mesh: THREE.InstancedMesh;
  private blocks: BlockSummary[] = [];
  private tint: ((b: BlockSummary) => string) | null = null;
  private m = new THREE.Matrix4();
  private c = new THREE.Color();

  constructor(private capacity: number) {
    const geo = new THREE.BoxGeometry(0.36, 0.3, 0.3);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.15, map: boxFace() });
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
  }

  /** Put `blocks[i]` at `slots[i]`; `tint` picks a colour per block (default: gold by fees). */
  fill(blocks: BlockSummary[], slots: THREE.Vector3[], tint?: (b: BlockSummary) => string) {
    this.tint = tint ?? null;
    this.blocks = blocks.slice(0, Math.min(this.capacity, slots.length));
    const max = Math.max(4, ...this.blocks.map((b) => b.tx_count));
    this.blocks.forEach((b, i) => {
      const txs = Math.max(0, b.tx_count - 1);
      const k = 0.7 + 0.5 * Math.min(1, txs / max);
      this.m.makeScale(k, k, k).setPosition(slots[i].x, slots[i].y + 0.15 * k, slots[i].z);
      this.mesh.setMatrixAt(i, this.m);
      // empty blocks grey; the more fees, the warmer the gold
      if (this.tint) this.c.set(this.tint(b));
      else if (!txs) this.c.set("#77737f");
      else this.c.set("#f4b728").lerp(new THREE.Color("#ff7a1a"), Math.min(1, (b.fees ?? 0) / 200000));
      this.mesh.setColorAt(i, this.c);
    });
    this.mesh.count = this.blocks.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  unshift(b: BlockSummary, slots: THREE.Vector3[]) {
    if (this.blocks.some((x) => x.height === b.height)) return;
    this.fill([b, ...this.blocks], slots, this.tint ?? undefined);
  }

  private at(hit: THREE.Intersection) {
    return hit.object === this.mesh && hit.instanceId != null ? this.blocks[hit.instanceId] : undefined;
  }

  hover(hit: THREE.Intersection) {
    const b = this.at(hit);
    return b ? `<b>Block ${num(b.height)}</b><span>${Math.max(0, b.tx_count - 1)} tx · ${ago(Date.parse(b.time))} ago</span>` : null;
  }

  pick(hit: THREE.Intersection): PickInfo | null {
    const b = this.at(hit);
    if (!b) return null;
    const txs = Math.max(0, b.tx_count - 1);
    return {
      eyebrow: "Block · on the shelf",
      title: num(b.height),
      mono: true,
      tag: txs ? [`${txs} transaction${txs > 1 ? "s" : ""}`, "ok"] : ["Coinbase only", "muted"],
      stats: [
        ["Fees", zec(b.fees ?? 0, 5).replace(" ZEC", "")],
        ["Size", `${(b.size / 1000).toFixed(1)} kB`],
        ["Mined", `${ago(Date.parse(b.time))} ago`],
        ["Pool", esc(b.miner_pool ?? "unknown")],
      ],
      body: `<div class="note">Mined ${new Date(b.time).toLocaleString("en-GB")} by ${esc(b.miner_pool ?? "an unknown miner")}. Open it on ZScan for every transaction inside.</div>`,
      link: { href: links.block(b.height), label: "Block on ZScan" },
    };
  }
}

// ---- parcels: the pending transactions ---------------------------------------------------------

/** One parcel per mempool transaction on the pickup wall, kept in step with the live mempool. */
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
    private slot: (col: number, row: number) => THREE.Vector3,
  ) {
    parent.add(this.group);
    this.sync();
  }

  sync() {
    const rack = this.ctx.director.rackTxs().filter((t) => !this.incoming.has(t.txid));
    const txs = [...rack, ...[...this.held.values()].filter((t) => !rack.includes(t))].slice(-70);
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
      m.position.copy(this.slot(i % 14, Math.floor(i / 14)));
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
  c.width = 512;
  c.height = 256;
  const g = c.getContext("2d")!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.2), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
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
        body: `<div class="note">Each transaction is a parcel on the pickup wall by the counter. A truck driver brings it in, a zkSNARK collects it and waits at the bus stop for the next block.</div>`,
        link: { href: "https://zscan.cash/mempool", label: "Mempool on ZScan" },
      };
    },
  };
}

// ---- voxel furniture ------------------------------------------------------------------------------

/** A double-sided shop shelf run, `len` voxels long and `h` high, four boards. */
function shelfModel(len: number, h: number) {
  const L = len * 2;
  const m = new VoxelModel(L, h, 6);
  m.box(0, 0, 2, L, h, 4, C("#55525e"));
  for (const y of [0, 3, 6, 9]) m.box(0, y, 0, L, y + 1, 6, C("#8a8694"));
  for (const x of [0, L - 1]) m.box(x, 0, 0, x + 1, h, 6, C("#2a2830"));
  // small price tags on the board edges
  for (const y of [0, 3, 6, 9]) for (const z of [0, 5]) for (let x = 3; x < L - 2; x += 6) m.set(x, y, z, E("#f4b728", 0.6));
  return m;
}

/** A tall archive rack: five levels, steel uprights every metre. */
function rackModel(lenM: number, h: number) {
  const L = Math.round(lenM * 6);
  const m = new VoxelModel(L, h, 6);
  for (let level = 0; level < 5; level++) m.box(0, level * 3.12, 0, L, level * 3.12 + 1, 6, C("#4a4656"));
  for (let x = 0; x < L; x += 12) {
    m.box(x, 0, 0, x + 1, h, 1, C("#2e2c36"));
    m.box(x, 0, 5, x + 1, h, 6, C("#2e2c36"));
    m.set(x, h - 1, 0, E("#f4b728", 1.2));
    m.set(x, h - 1, 5, E("#f4b728", 1.2));
  }
  m.box(0, 0, 2, L, h - 1, 4, C("#1e1c24"));
  return m;
}

/** The pickup counter: wood front, light top, a till and a card reader. */
function counterModel() {
  const m = new VoxelModel(24, 9, 7);
  m.box(0, 0, 0, 24, 6, 7, shades(["#5a4a3c", "#544536", "#604e40"], 1, 3));
  m.box(0, 6, 0, 24, 7, 7, C("#e8e2d4"));
  m.box(16, 7, 2, 20, 9, 5, C("#2a2a30"));
  m.box(17, 8, 1, 19, 9, 2, E("#59e3ff", 1.2));
  m.box(3, 7, 2, 5, 8, 4, C("#3a3a42"));
  m.box(0, 5, 7, 24, 6, 7, E("#ff9f2e", 0.8));
  return m;
}

/** Pigeonholes for parcels, 14 × 5, behind the counter. */
function cubbyModel() {
  const m = new VoxelModel(48, 17, 5);
  m.box(0, 0, 0, 48, 17, 5, C("#6a5a4a"));
  for (let c = 0; c < 14; c++) for (let r = 0; r < 5; r++) m.clear(1 + c * 3.4, 1 + r * 3.1, 1, 1 + c * 3.4 + 3, 1 + r * 3.1 + 2.6, 5);
  return m;
}

/** A drinks fridge: dark body, glass door, glowing rows of bottles. */
function fridgeModel() {
  const m = new VoxelModel(13, 14, 6);
  m.box(0, 0, 0, 13, 14, 6, C("#2e3240"));
  m.box(1, 1, 5, 12, 13, 6, G("#8ab0d0"));
  const tones = ["#d0504a", "#4a9ad0", "#d0b04a", "#6ac06a", "#e8e8e8"];
  for (let y = 2; y < 13; y += 3) for (let x = 1; x < 12; x++) m.set(x, y, 4, E(tones[(x + y) % tones.length], 0.8));
  m.box(0, 13, 5, 13, 14, 6, E("#cfe8ff", 1.2));
  return m;
}

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

/** A box face with a darker label band (the colour comes from each instance). */
function boxFace() {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 32, 32);
  g.fillStyle = "#3a3a3a";
  g.fillRect(4, 11, 24, 10);
  g.fillStyle = "#d8d8d8";
  g.fillRect(6, 14, 14, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}
