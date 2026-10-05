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

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const num = (n: number) => n.toLocaleString("en-US");
const zec = (zat: number, d = 5) => `${(zat / 1e8).toLocaleString("en-US", { minimumFractionDigits: Math.min(2, d), maximumFractionDigits: d })} ZEC`;
const short = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;
const ago = (ms: number) => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
};

/** The shop floor: 12 × 9 m behind a glass front, the pickup table across the middle. */
const SHOP_Y = 0;
/** The Block Archive upstairs (far above the shop: neither floor ever sees the other). */
const ARCHIVE_Y = 40;
const TABLE_Z = -5.4,
  TABLE_TOP = 1.0;
/** Parcels on the table: two rows of 18, a second layer on top when it fills up. */
const COLS = 18;
const tableSlot = (i: number) => {
  const layer = Math.floor(i / (COLS * 2)),
    k = i % (COLS * 2);
  return new THREE.Vector3(-3.57 + (k % COLS) * 0.42, TABLE_TOP + 0.15 + layer * 0.31, TABLE_Z + (Math.floor(k / COLS) ? -0.24 : 0.24));
};

/**
 * Inside the MEMPOOL shop. Ground floor: truck drivers bring every pending transaction in as a
 * parcel and set it on the pickup table; zkSNARKs come in, take theirs and leave for the bus
 * stop; the board on the back wall shows the mempool live. Upstairs (1F): the Block Archive,
 * where any block from genesis to the tip is rebuilt in the room (see archive/).
 */
export function buildMempool(ctx: InteriorContext): Interior {
  const scene = makeScene(ctx.renderer, "#0d0c12");
  const pickables: THREE.Object3D[] = [];
  const rects: Rect[] = [];
  const ticks: ((dt: number, t: number) => void)[] = [];

  const tile = tileTexture();
  rects.push(
    ...room(scene, {
      x0: -6,
      z0: -9,
      x1: 6,
      z1: 0,
      h: 3.8,
      floor: new THREE.MeshStandardMaterial({ map: tile, roughness: 0.35, metalness: 0.05 }),
      wall: std("#cfc8bb", 0.9),
      ceiling: std("#8f8a82", 0.9),
      open: true,
    }),
  );
  // the chain's stripes along the walls: orange over teal
  for (const [y, c] of [
    [3.1, "#ff9f2e"],
    [2.95, "#3ec9b0"],
  ] as const) {
    box(scene, 11.9, 0.1, 0.02, glowMat(c, 1.4), 0, y, -8.88);
    box(scene, 0.02, 0.1, 8.8, glowMat(c, 1.4), -5.88, y, -4.5);
    box(scene, 0.02, 0.1, 8.8, glowMat(c, 1.4), 5.88, y, -4.5);
  }
  const panel = glowMat("#f4f0e8", 1.05);
  for (const x of [-3.5, 0, 3.5]) for (const z of [-2.4, -6.8]) box(scene, 2.2, 0.04, 0.6, panel, x, 3.74, z);
  // glass front with the door in the middle, the street glowing outside
  const glass = new THREE.MeshStandardMaterial({ color: "#7aa0c0", roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.35 });
  box(scene, 4.4, 3.0, 0.05, glass, -3.8, 0.1, -0.05);
  box(scene, 4.4, 3.0, 0.05, glass, 3.8, 0.1, -0.05);
  const mullion = std("#2a2830", 0.6, 0.4);
  for (const x of [-6, -3.6, -1.6, 1.6, 3.6, 6]) box(scene, 0.1, 3.2, 0.12, mullion, x, 0, -0.05);
  box(scene, 12, 0.6, 0.14, std("#e6e1d6", 0.9), 0, 3.2, -0.05);
  const street = new THREE.Mesh(new THREE.PlaneGeometry(30, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color("#3a2a52").multiplyScalar(1.2) }));
  street.position.set(0, 2, 3);
  street.rotation.y = Math.PI;
  scene.add(street);
  const name = textPlane("MEMPOOL", { h: 0.6, color: "#ff9f2e", glow: true });
  name.position.set(0, 3.3, -0.12);
  name.rotation.y = Math.PI;
  scene.add(name);

  // the pickup table across the room, its sign hanging over it
  const table = toObject(pickupTableModel());
  table.position.set(0, 0, TABLE_Z);
  scene.add(table);
  rects.push([-4.1, TABLE_Z - 0.62, 4.1, TABLE_Z + 0.62]);
  const sign = textPlane("受取 · PICKUP · PENDING TX", { h: 0.17, color: "#0d0d0d", bg: "#3ec9b0" });
  sign.position.set(0, 2.95, TABLE_Z + 0.1);
  scene.add(sign);
  for (const x of [-1.2, 1.2]) box(scene, 0.02, 0.75, 0.02, mullion, x, 3.04, TABLE_Z + 0.1);
  const parcels = new Parcels(ctx, scene, tableSlot);
  pickables.push(parcels.group);
  ticks.push(() => parcels.sync());

  // drinks fridges on the back wall, the live board next to them
  const fridge = toObject(fridgeModel());
  for (const x of [-5.2, -3.0]) {
    const f = fridge.clone();
    f.position.set(x, 0, -8.4);
    scene.add(f);
  }
  rects.push([-5.9, -8.9, -1.7, -7.7]);
  const board = liveBoard(ctx);
  board.mesh.position.set(2.6, 2.0, -8.85);
  scene.add(board.mesh);
  pickables.push(board.mesh);
  ticks.push(board.tick);

  for (const [x, z, c, i] of [
    [-3, -3, "#fff4e0", 5],
    [3, -3, "#fff4e0", 5],
    [0, -7, "#cfe8ff", 4],
  ] as const) {
    const l = new THREE.PointLight(c, i, 12, 1.6);
    l.position.set(x, 3.4, z);
    scene.add(l);
  }

  // ---- people: the shopkeeper behind the table ---------------------------------------------------
  const people: Snark[] = [];
  void (async () => {
    try {
      const s = new Snark(6221, await loadArt(6221));
      s.noClip = true;
      s.state = "resident";
      s.role = "Shopkeeper";
      s.root.position.set(-2.6, SHOP_Y, TABLE_Z - 1.0);
      s.faceDir = new THREE.Vector3(0, 0, 1);
      scene.add(s.root);
      people.push(s);
    } catch {}
  })();

  // ---- the live street, replayed in here: drivers set parcels down, zkSNARKs collect them ---------
  /** Last frame drawn in here: visits are replayed only while someone is watching. */
  let seen = 0;
  let visiting = 0;
  const DOOR_IN = new THREE.Vector3(0, SHOP_Y, 0.9),
    DOOR = new THREE.Vector3(0, SHOP_Y, -0.8);
  /** In through the door, to the table in front of the parcel. */
  const toTable = (x: number) => [DOOR, new THREE.Vector3(THREE.MathUtils.clamp(x, -3.8, 3.8), SHOP_Y, TABLE_Z + 0.95)];
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
      s.root.position.copy(DOOR_IN);
      scene.add(s.root);
      people.push(s);
      const at = pickup ? parcels.where(v.tx.txid) : null;
      const path = toTable(at ? at.x : -3 + Math.random() * 6);
      await s.walk(path, pickup ? 1.4 : 1.6);
      s.faceDir = new THREE.Vector3(0, 0, -1);
      await new Promise((r) => setTimeout(r, 450));
      // take the parcel off the table, or set it down
      if (pickup) parcels.held.delete(v.tx.txid);
      else parcels.incoming.delete(v.tx.txid);
      parcels.sync();
      s.showParcels(pickup);
      await new Promise((r) => setTimeout(r, 350));
      s.faceDir = null;
      await s.walk([DOOR, DOOR_IN], pickup ? 1.5 : 1.7);
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
    title: "MEMPOOL",
    scene,
    floors: [{ label: "G", name: "The shop · pending transactions", y: SHOP_Y, spawn: new THREE.Vector3(0, SHOP_Y, -0.9), yaw: 0 }, archive.floor],
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
        body: `<div class="note">Each transaction is a parcel on the pickup table. A truck driver brings it in, a zkSNARK collects it and waits at the bus stop for the next block.</div>`,
        link: { href: "https://zscan.cash/mempool", label: "Mempool on ZScan" },
      };
    },
  };
}

// ---- voxel furniture ------------------------------------------------------------------------------





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
