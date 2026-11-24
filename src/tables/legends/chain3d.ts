/**
 * ZK LEGENDS' live chain: a rail beside the table on the right, fed by ZScan (src/data/zscan.ts).
 * The last mined blocks stand on it, oldest far, newest near, chained together, each with its height,
 * its transactions and its pool painted on top (gold when it carries shielded traffic, iron when only
 * transparent). At the near end the next block is being validated: a glass cube that fills with the
 * mempool, one small cube per transaction flying in, coloured by kind, a timer since the last block.
 * When a block is mined the glass flashes, the Z seal stamps it, the included transactions fuse into a
 * solid block, the chain moves one step down the rail and the oldest block falls off the far end.
 *
 * View3D builds one, ticks it, raycasts its `pickables` (userData.chain: ChainInfo) and disposes it.
 * The feed is the /v1/ws stream (connectFeed); when the socket isn't live (offline, or the test pages
 * that stub WebSocket) the rail polls the API every 20 s instead.
 */
import * as THREE from "three";
import type { MapKind } from "./maps";
import { GOLD, cnv, innerShadow, lacquer, metalFill, puffTex, rgba, softDot, stepRect, zMark, type Trim } from "./boardart";
import { ZScan, connectFeed, get } from "../../data/zscan";
import type { Block, BlockSummary, Tx, TxKind } from "../../data/types";

/** What a block on the rail shows when pointed at (ui.ts draws the tooltip). */
export interface ChainInfo {
  height: number;
  txs: number;
  time: number;
  pool: string | null;
  fees: number | null;
  /** The block still being filled from the mempool. */
  pending?: boolean;
}

// ---- layout (world units) ---------------------------------------------------------------------------------

/**
 * The rail runs along z, angled a little toward the table at its near end (where perspective spreads
 * things out): world x 11.75 at the far end, 11.1 at the near end. Everything is built in the rail's
 * own frame (x 0 on its axis) inside `group`, which carries that placement.
 */
const RAIL_SLOPE = (11.1 - 11.75) / (4.6 + 5.6);
const RAIL_X = 11.75 + 5.6 * RAIL_SLOPE;
const X = 0;
/** The block being validated (near end). */
const Z0 = 4.6;
const STEP = 1.6;
/** Mined blocks kept on the rail. */
const KEEP = 6;
const BW = 1.5,
  BH = 0.5,
  BD = 1.08;
/** The glass cube's height. */
const GH = 0.82;
const slotZ = (k: number) => Z0 - STEP * (k + 1);

// pellets: one per mempool transaction, stacked in the glass layer by layer
const NX = 6,
  NZ = 4,
  NY = 3,
  CAP = NX * NZ * NY,
  PEL = 0.17,
  PSTEP = 0.22;
function slotPos(i: number, out: THREE.Vector3) {
  const ix = i % NX,
    iz = Math.floor(i / NX) % NZ,
    iy = Math.floor(i / (NX * NZ));
  return out.set((ix - (NX - 1) / 2) * PSTEP, 0.14 + iy * PSTEP, (iz - (NZ - 1) / 2) * PSTEP);
}

const IRON: Trim = { m0: "#1a1816", m1: "#4a4642", m2: "#9a948a", m3: "#e2dcd0" };
const KIND_COL: Record<TxKind, string> = {
  shielded: "#f4b728",
  migration: "#ffd98a",
  shielding: "#ff8a3a",
  deshielding: "#3fc8b8",
  mixed: "#b98aff",
  transparent: "#8ea4bc",
  coinbase: "#e8e0d0",
};
const SHIELDY = new Set<TxKind>(["shielded", "shielding", "deshielding", "migration", "mixed"]);
const KINDS = Object.keys(KIND_COL) as TxKind[];

const easeIn = (k: number) => k * k * k;
const easeOut = (k: number) => 1 - (1 - k) ** 3;
const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
const easeBack = (k: number) => 1 + 2.4 * (k - 1) ** 3 + 1.4 * (k - 1) ** 2;
const FONT = (w: number, px: number) => `${w} condensed ${px}px Archivo, Geist, sans-serif`;

interface Mined {
  group: THREE.Group;
  top: THREE.MeshBasicMaterial;
  tex: THREE.CanvasTexture;
  cv: HTMLCanvasElement;
  info: ChainInfo;
  /** Carries shielded traffic (null: not known yet). */
  shielded: boolean | null;
}
interface Pellet {
  txid: string;
  kind: TxKind;
  fee: number;
  /** Flight: from (local to the glass), 0…1 progress, seconds. */
  from: THREE.Vector3 | null;
  t: number;
  /** Fusing into the mined block. */
  fuse: number;
}
interface Tween {
  t: number;
  dur: number;
  f: (k: number) => void;
  done: () => void;
}

export class ChainRail {
  readonly group = new THREE.Group();
  /** Meshes that answer the pointer: userData.chain = ChainInfo. */
  readonly pickables: THREE.Object3D[] = [];

  private closed = false;
  private closeFeed: (() => void) | null = null;
  private poll: ReturnType<typeof setInterval> | undefined;
  private status: "connecting" | "live" | "offline" = "connecting";
  private disposables: { dispose(): void }[] = [];
  private tweens: Tween[] = [];

  private mined: Mined[] = [];
  private falling = new Set<Mined>();
  private tipHeight = 0;
  private tipTime = 0;
  private queue: Block[] = [];
  private sealing = false;
  private seen = new Set<string>();

  // the glass
  private pend = new THREE.Group();
  private glass!: THREE.MeshStandardMaterial;
  private edgeMat!: THREE.MeshStandardMaterial;
  private edges!: THREE.InstancedMesh;
  private pellets!: THREE.InstancedMesh;
  private pel: (Pellet | null)[] = new Array(CAP).fill(null);
  /** Waiting transactions beyond the glass's room. */
  private extra = 0;
  private pelDirty = true;
  private scan!: THREE.Mesh;
  private label!: { cv: HTMLCanvasElement; tex: THREE.CanvasTexture };
  private labelKey = "";
  private pendInfo: ChainInfo = { height: 0, txs: 0, time: 0, pool: null, fees: 0, pending: true };
  private stamp!: THREE.Mesh;
  private flash!: THREE.Sprite;
  private links!: THREE.InstancedMesh;
  private puffs: { s: THREE.Sprite; t: number; v: THREE.Vector3 }[] = [];

  // shared
  private boxGeo = new THREE.BoxGeometry(BW, BH, BD);
  private sideGold = new THREE.MeshStandardMaterial({ color: "#7a5418", roughness: 0.42, metalness: 0.75 });
  private sideIron = new THREE.MeshStandardMaterial({ color: "#3e3a36", roughness: 0.5, metalness: 0.6 });
  private bottom = new THREE.MeshStandardMaterial({ color: "#120f0c", roughness: 0.9 });

  constructor(scene: THREE.Scene, _kind: MapKind) {
    this.group.position.set(RAIL_X, 0, 0);
    this.group.rotation.y = Math.atan(RAIL_SLOPE);
    scene.add(this.group);
    this.disposables.push(this.boxGeo, this.sideGold, this.sideIron, this.bottom);
    this.buildRail();
    this.buildGlass();
    this.buildLinks();
    if (typeof window === "undefined") return;
    // the fonts the faces are painted with, then everything painted again
    void document.fonts
      ?.load(FONT(800, 40))
      .then(() => {
        if (this.closed) return;
        for (const m of this.mined) this.paintTop(m);
        this.labelKey = "";
      })
      .catch(() => {});
    void this.start();
  }

  // ---- building ------------------------------------------------------------------------------------------

  private buildRail() {
    const g = this.group;
    const L = 11.5,
      zc = -0.42;
    const stone = new THREE.MeshStandardMaterial({ color: "#1b1814", roughness: 0.78, metalness: 0.35 });
    const iron = new THREE.MeshStandardMaterial({ color: "#2a2622", roughness: 0.55, metalness: 0.65 });
    const brass = new THREE.MeshStandardMaterial({ color: "#c8962a", roughness: 0.32, metalness: 0.92 });
    const groove = new THREE.MeshStandardMaterial({ color: "#0a0807", roughness: 0.9 });
    this.disposables.push(stone, iron, brass, groove);
    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, shadow = true) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      this.disposables.push(geo);
      const o = new THREE.Mesh(geo, m);
      o.position.set(x, y, z);
      o.receiveShadow = true;
      o.castShadow = shadow;
      g.add(o);
      return o;
    };
    // a plinth from the floor up to the table's height, an iron cap, two brass rails, the groove
    box(1.8, 1.6, L, stone, X, -0.8, zc);
    box(1.92, 0.08, L + 0.12, iron, X, 0.0, zc);
    box(0.07, 0.07, L - 0.1, brass, X - 0.8, 0.075, zc, false);
    box(0.07, 0.07, L - 0.1, brass, X + 0.8, 0.075, zc, false);
    box(0.46, 0.014, L - 0.3, groove, X, 0.047, zc, false);
    // brass end caps, studded
    for (const z of [zc - L / 2 + 0.06, zc + L / 2 - 0.06]) {
      box(1.84, 0.16, 0.14, brass, X, 0.1, z);
    }
    // the far end's plate: ZCASH · LIVE
    const cv = cnv(512, 112);
    const pg = cv.getContext("2d")!;
    const outer = stepRect(4, 4, 504, 104, 10);
    metalFill(pg, outer, GOLD, 4, 4, 508, 108, 4);
    const inner = stepRect(16, 16, 480, 80, 6);
    lacquer(pg, inner, { deep: "#0c0905", mid: "#1c140a", light: "#2c2010" }, 16, 16, 496, 96);
    zMark(pg, 60, 56, 5, GOLD.m2);
    pg.font = FONT(800, 46);
    pg.textBaseline = "middle";
    pg.fillStyle = "#f3e2b0";
    pg.fillText("ZCASH  ·  LIVE CHAIN", 104, 58);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const pm = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(0.85, 0.85, 0.85) });
    const pgeo = new THREE.PlaneGeometry(1.64, 0.36).rotateX(-Math.PI / 2);
    this.disposables.push(tex, pm, pgeo);
    const plate = new THREE.Mesh(pgeo, pm);
    plate.position.set(X, 0.05, zc - L / 2 + 0.42);
    g.add(plate);
  }

  private buildGlass() {
    const p = this.pend;
    p.position.set(X, 0.04, Z0);
    this.group.add(p);
    // its base: an iron tray
    const trayGeo = new THREE.BoxGeometry(BW + 0.08, 0.06, BD + 0.08);
    const trayMat = new THREE.MeshStandardMaterial({ color: "#24201c", roughness: 0.5, metalness: 0.7 });
    const tray = new THREE.Mesh(trayGeo, trayMat);
    tray.position.y = 0.03;
    tray.receiveShadow = true;
    p.add(tray);
    // the glass
    const gGeo = new THREE.BoxGeometry(BW, GH, BD);
    this.glass = new THREE.MeshStandardMaterial({ color: "#fff2cf", transparent: true, opacity: 0.13, roughness: 0.08, metalness: 0.2, depthWrite: false });
    const glass = new THREE.Mesh(gGeo, this.glass);
    glass.position.y = GH / 2 + 0.06;
    glass.renderOrder = 4;
    p.add(glass);
    // its twelve edges, chunky (voxel), in brass
    const eGeo = new THREE.BoxGeometry(1, 1, 1);
    this.edgeMat = new THREE.MeshStandardMaterial({ color: "#d9a42a", roughness: 0.3, metalness: 0.9, emissive: "#000000" });
    this.edges = new THREE.InstancedMesh(eGeo, this.edgeMat, 12);
    const m = new THREE.Matrix4();
    const T = 0.05;
    let i = 0;
    const hy = GH / 2 + 0.06;
    for (const sy of [-1, 1])
      for (const sz of [-1, 1]) this.edges.setMatrixAt(i++, m.compose(new THREE.Vector3(0, hy + (sy * GH) / 2, (sz * BD) / 2), new THREE.Quaternion(), new THREE.Vector3(BW + T, T, T)));
    for (const sy of [-1, 1])
      for (const sx of [-1, 1]) this.edges.setMatrixAt(i++, m.compose(new THREE.Vector3((sx * BW) / 2, hy + (sy * GH) / 2, 0), new THREE.Quaternion(), new THREE.Vector3(T, T, BD + T)));
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) this.edges.setMatrixAt(i++, m.compose(new THREE.Vector3((sx * BW) / 2, hy, (sz * BD) / 2), new THREE.Quaternion(), new THREE.Vector3(T, GH + T, T)));
    this.edges.castShadow = true;
    p.add(this.edges);
    // the pellets
    const pGeo = new THREE.BoxGeometry(PEL, PEL, PEL);
    const pMat = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.15 });
    this.pellets = new THREE.InstancedMesh(pGeo, pMat, CAP);
    this.pellets.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3);
    this.pellets.frustumCulled = false;
    this.pellets.castShadow = true;
    p.add(this.pellets);
    // the scan line, rising and falling through the glass
    const sGeo = new THREE.PlaneGeometry(BW - 0.1, BD - 0.1).rotateX(-Math.PI / 2);
    const sMat = new THREE.MeshBasicMaterial({ color: "#ffe6a0", transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.scan = new THREE.Mesh(sGeo, sMat);
    this.scan.renderOrder = 5;
    p.add(this.scan);
    // the label over it, turned to the camera
    const cv = cnv(512, 150);
    const lt = new THREE.CanvasTexture(cv);
    lt.colorSpace = THREE.SRGBColorSpace;
    lt.anisotropy = 8;
    const lGeo = new THREE.PlaneGeometry(1.6, 0.47);
    const lMat = new THREE.MeshBasicMaterial({ map: lt, transparent: true, depthWrite: false, color: new THREE.Color(0.92, 0.92, 0.92) });
    const label = new THREE.Mesh(lGeo, lMat);
    label.position.set(0, GH + 0.5, -0.05);
    label.rotation.x = -1.07;
    label.renderOrder = 6;
    p.add(label);
    this.label = { cv, tex: lt };
    // the Z seal that stamps a mined block
    const cGeo = new THREE.CylinderGeometry(0.44, 0.44, 0.09, 28);
    const ccv = cnv(160, 160);
    const cg = ccv.getContext("2d")!;
    const disc = new Path2D();
    disc.arc(80, 80, 76, 0, Math.PI * 2);
    metalFill(cg, disc, GOLD, 4, 4, 156, 156, 5);
    const inner = new Path2D();
    inner.arc(80, 80, 56, 0, Math.PI * 2);
    cg.save();
    cg.fillStyle = "rgba(60,36,4,0.35)";
    cg.fill(inner);
    cg.restore();
    zMark(cg, 80, 82, 10, "rgba(70,42,4,0.9)");
    const ct = new THREE.CanvasTexture(ccv);
    ct.colorSpace = THREE.SRGBColorSpace;
    const cTop = new THREE.MeshBasicMaterial({ map: ct, transparent: true });
    const cSide = new THREE.MeshStandardMaterial({ color: "#d9a42a", roughness: 0.3, metalness: 0.9, transparent: true });
    this.stamp = new THREE.Mesh(cGeo, [cSide, cTop, cSide]);
    this.stamp.visible = false;
    this.stamp.castShadow = true;
    this.group.add(this.stamp);
    // the flash
    const fMat = new THREE.SpriteMaterial({ map: softDot(), color: "#fff0c0", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.flash = new THREE.Sprite(fMat);
    this.flash.position.set(X, 0.5, Z0);
    this.group.add(this.flash);
    this.disposables.push(trayGeo, trayMat, gGeo, this.glass, eGeo, this.edgeMat, pGeo, pMat, sGeo, sMat, lt, lGeo, lMat, cGeo, ct, cTop, cSide, fMat);
    // pointing at the glass
    glass.userData.chain = this.pendInfo;
    this.pickables.push(glass);
  }

  private buildLinks() {
    const geo = new THREE.TorusGeometry(0.12, 0.034, 6, 14);
    const mat = new THREE.MeshStandardMaterial({ color: "#d4a032", roughness: 0.28, metalness: 0.95 });
    this.links = new THREE.InstancedMesh(geo, mat, (KEEP + 2) * 2);
    this.links.frustumCulled = false;
    this.links.castShadow = true;
    this.group.add(this.links);
    this.disposables.push(geo, mat);
  }

  // ---- painting --------------------------------------------------------------------------------------------

  private paintTop(m: Mined) {
    const c = m.cv;
    const g = c.getContext("2d")!;
    const W = c.width,
      H = c.height;
    g.clearRect(0, 0, W, H);
    const gold = m.shielded !== false;
    const trim = gold ? GOLD : IRON;
    metalFill(g, stepRect(3, 3, W - 6, H - 6, 14), trim, 3, 3, W - 3, H - 3, 5);
    const inner = stepRect(24, 24, W - 48, H - 48, 10);
    lacquer(g, inner, gold ? { deep: "#0e0904", mid: "#21160a", light: "#38270f" } : { deep: "#0b0a09", mid: "#1a1816", light: "#2a2724" }, 24, 24, W - 24, H - 24);
    innerShadow(g, inner, 14, 0.8, 0, 4);
    const s = m.info.height ? m.info.height.toLocaleString("en-US") : "···";
    let size = 150;
    g.font = FONT(800, size);
    while (g.measureText(s).width > W - 92 && size > 40) g.font = FONT(800, (size -= 4));
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineJoin = "round";
    g.lineWidth = 12;
    g.strokeStyle = "#0a0603";
    const y = H * 0.43;
    g.strokeText(s, W / 2, y);
    const fg = g.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    fg.addColorStop(0, gold ? "#fff6d8" : "#f4f0e8");
    fg.addColorStop(1, gold ? "#f2c24c" : "#b4aea4");
    g.fillStyle = fg;
    g.fillText(s, W / 2, y);
    const sub = `${m.info.txs} TX${m.info.pool ? `  ·  ${m.info.pool.toUpperCase()}` : ""}`;
    let ss = 48;
    g.font = FONT(700, ss);
    while (g.measureText(sub).width > W - 110 && ss > 22) g.font = FONT(700, (ss -= 2));
    g.fillStyle = rgba(trim.m2, 0.95);
    g.fillText(sub, W / 2, H * 0.77);
    m.tex.needsUpdate = true;
  }

  private paintLabel(now: number) {
    const secs = this.tipTime ? Math.max(0, Math.floor((now - this.tipTime) / 1000)) : -1;
    const n = this.count();
    const key = `${secs}|${n}|${this.status}|${this.mode()}`;
    if (key === this.labelKey) return;
    this.labelKey = key;
    const c = this.label.cv;
    const g = c.getContext("2d")!;
    const W = c.width,
      H = c.height;
    g.clearRect(0, 0, W, H);
    metalFill(g, stepRect(3, 3, W - 6, H - 6, 10), GOLD, 3, 3, W - 3, H - 3, 4);
    const inner = stepRect(16, 16, W - 32, H - 32, 6);
    lacquer(g, inner, { deep: "#0c0905", mid: "#1a130a", light: "#2c2010" }, 16, 16, W - 16, H - 16);
    // the feed's lamp: green live, gold polling, grey offline
    const lamp = this.mode() === "live" ? "#7ee08a" : this.mode() === "poll" ? "#f4b728" : "#8a847c";
    const gl = g.createRadialGradient(48, 52, 0, 48, 52, 22);
    gl.addColorStop(0, rgba(lamp, 0.9));
    gl.addColorStop(1, rgba(lamp, 0));
    g.fillStyle = gl;
    g.fillRect(20, 24, 56, 56);
    g.beginPath();
    g.arc(48, 52, 8, 0, Math.PI * 2);
    g.fillStyle = lamp;
    g.fill();
    g.textBaseline = "middle";
    g.textAlign = "left";
    g.font = FONT(800, 40);
    g.fillStyle = "#e8cf92";
    g.fillText("NEXT BLOCK", 74, 50);
    const t = secs < 0 ? "–:––" : secs >= 600 ? "10m+" : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
    g.font = FONT(800, 74);
    g.lineWidth = 9;
    g.strokeStyle = "#0a0603";
    g.strokeText(t, 32, 108);
    g.fillStyle = "#ffffff";
    g.fillText(t, 32, 108);
    const tw = g.measureText(t).width;
    g.font = FONT(800, 56);
    g.strokeText(`${n} TX`, 32 + tw + 22, 110);
    g.fillStyle = "#f4c450";
    g.fillText(`${n} TX`, 32 + tw + 22, 110);
    this.label.tex.needsUpdate = true;
  }

  // ---- data ------------------------------------------------------------------------------------------------

  private mode(): "live" | "poll" | "off" {
    return this.status === "live" ? "live" : this.status === "offline" && !this.tipHeight ? "off" : "poll";
  }

  private async start() {
    // the chain so far
    const list = await get<BlockSummary[]>(`/v1/blocks?limit=${KEEP}`);
    if (this.closed) return;
    if (list?.length) {
      const sorted = list.slice().sort((a, b) => b.height - a.height);
      if (sorted[0].height > this.tipHeight) {
        this.tipHeight = sorted[0].height;
        this.tipTime = Date.parse(sorted[0].time);
      }
      sorted.slice(0, KEEP).forEach((b, k) => {
        const m = this.makeBlock({ height: b.height, txs: b.tx_count, time: Date.parse(b.time), pool: b.miner_pool, fees: b.fees }, null);
        m.group.position.set(X, 1.6, slotZ(k));
        m.group.scale.setScalar(0.001);
        this.mined.push(m);
        // they drop onto the rail one after another, far to near
        const delay = (KEEP - k) * 0.08;
        this.later(delay, () =>
          this.tween(0.42, (q) => {
            m.group.scale.setScalar(Math.min(1, 0.4 + q * 1.2));
            m.group.position.y = 1.6 * (1 - easeIn(q));
          }),
        );
      });
      // whether each carries shielded traffic (its transactions): asked one by one, gently
      void (async () => {
        for (const m of this.mined.slice()) {
          if (this.closed) return;
          const d = await ZScan.block(m.info.height);
          if (!d || this.closed) continue;
          m.shielded = d.txs.some((t) => SHIELDY.has(t.kind));
          m.info.txs = d.txs.length + 1;
          if (d.pool) m.info.pool = d.pool;
          this.paintTop(m);
          this.setSide(m);
        }
      })();
    }
    // the live feed
    this.closeFeed = connectFeed({
      snapshot: (txs, last) => {
        if (last && !this.tipHeight) {
          this.tipHeight = last.height;
          this.tipTime = Date.parse(last.time);
        }
        for (const t of txs) this.addTx(t, true);
      },
      tx: (t) => this.addTx(t),
      block: (b) => this.enqueue(b),
      mempool: (ids) => this.prune(ids),
      status: (s) => (this.status = s),
    });
    // (when the socket isn't live: ask every 20 s)
    this.poll = setInterval(() => void this.pollOnce(), 20_000);
  }

  private polling = false;
  private async pollOnce() {
    if (this.closed || this.status === "live" || this.polling) return;
    this.polling = true;
    try {
      const tip = (await get<BlockSummary[]>("/v1/blocks?limit=1"))?.[0];
      if (tip && tip.height > this.tipHeight && !this.closed) {
        const from = this.tipHeight ? Math.max(this.tipHeight + 1, tip.height - 2) : tip.height;
        for (let h = from; h <= tip.height && !this.closed; h++) {
          const b = await ZScan.block(h);
          if (b) this.enqueue(b);
        }
      }
      const mp = await ZScan.mempool();
      if (mp && !this.closed) {
        this.prune(new Set(mp.map((t) => t.txid)));
        for (const t of mp) this.addTx(t);
      }
    } finally {
      this.polling = false;
    }
  }

  private count() {
    return this.pel.reduce((n, p) => n + (p && p.fuse < 0 ? 1 : 0), 0) + this.extra;
  }

  private addTx(t: Tx, instant = false) {
    if (this.closed || this.seen.has(t.txid) || t.kind === "coinbase") return;
    this.seen.add(t.txid);
    const i = this.pel.findIndex((p) => !p);
    if (i < 0) {
      this.extra++;
      return;
    }
    // from off the screen's right edge, over the rail, into its place
    const from = instant ? null : new THREE.Vector3(3.4, 2.6 + Math.random() * 0.8, -1.4 + Math.random() * 2.8);
    this.pel[i] = { txid: t.txid, kind: t.kind, fee: t.fee ?? 0, from, t: 0, fuse: -1 };
    const c = new THREE.Color(KIND_COL[t.kind] ?? "#cccccc");
    this.pellets.setColorAt(i, c);
    this.pellets.instanceColor!.needsUpdate = true;
    this.pelDirty = true;
  }

  /** Transactions no longer waiting (expired, replaced) leave the glass. */
  private prune(ids: Set<string>) {
    for (let i = 0; i < CAP; i++) {
      const p = this.pel[i];
      if (p && p.fuse < 0 && !ids.has(p.txid)) this.pel[i] = null;
    }
    this.pelDirty = true;
  }

  private enqueue(b: Block) {
    if (this.closed || b.height <= this.tipHeight || this.queue.some((q) => q.height === b.height)) return;
    this.queue.push(b);
    this.queue.sort((a, c) => a.height - c.height);
    if (!this.sealing) void this.next();
  }

  private async next() {
    while (this.queue.length && !this.closed) {
      const b = this.queue.shift()!;
      if (b.height <= this.tipHeight) continue;
      this.sealing = true;
      await this.seal(b);
      this.sealing = false;
    }
  }

  // ---- the mined block ---------------------------------------------------------------------------------------

  private makeBlock(info: ChainInfo, shielded: boolean | null): Mined {
    const cv = cnv(512, 346);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const top = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(0.93, 0.93, 0.93) });
    const side = shielded === false ? this.sideIron : this.sideGold;
    const box = new THREE.Mesh(this.boxGeo, [side, side, top, this.bottom, side, side]);
    box.position.y = BH / 2 + 0.06;
    box.castShadow = true;
    box.receiveShadow = true;
    const group = new THREE.Group();
    group.add(box);
    group.userData.chain = info;
    this.group.add(group);
    this.pickables.push(group);
    const m: Mined = { group, top, tex, cv, info, shielded };
    this.paintTop(m);
    return m;
  }
  private setSide(m: Mined) {
    const box = m.group.children[0] as THREE.Mesh;
    const side = m.shielded === false ? this.sideIron : this.sideGold;
    box.material = [side, side, m.top, this.bottom, side, side];
  }
  private dropBlock(m: Mined) {
    const i = this.pickables.indexOf(m.group);
    if (i >= 0) this.pickables.splice(i, 1);
    m.group.removeFromParent();
    m.top.dispose();
    m.tex.dispose();
  }

  /** A block is mined: flash, the seal stamps it, the transactions fuse, the chain moves one step. */
  private async seal(b: Block) {
    const inBlock = new Set(b.txs.map((t) => t.txid));
    const fake = (b as Block & { fake?: boolean }).fake;
    const fuse: number[] = [];
    for (let i = 0; i < CAP; i++) {
      const p = this.pel[i];
      if (p && (fake || inBlock.has(p.txid))) {
        p.fuse = 0;
        p.from = null;
        fuse.push(i);
      }
    }
    // the ones the block took but the glass never showed (beyond its room) stop counting too
    const known = new Set(this.pel.filter(Boolean).map((p) => p!.txid));
    const hidden = b.txs.filter((t) => !known.has(t.txid) && this.seen.has(t.txid)).length;
    this.extra = Math.max(0, this.extra - (fake ? this.extra : hidden));
    for (const t of b.txs) this.seen.add(t.txid);
    this.tipHeight = b.height;
    this.tipTime = b.time || Date.now();
    this.labelKey = "";
    const shielded = b.txs.some((t) => SHIELDY.has(t.kind));
    const info: ChainInfo = { height: b.height, txs: b.txs.length + 1, time: b.time, pool: b.pool, fees: b.fees };

    // 1) the glass flashes, the edges light
    const fm = this.flash.material as THREE.SpriteMaterial;
    void this.tween(0.5, (k) => {
      fm.opacity = Math.sin(Math.min(1, k * 1.6) * Math.PI) * 0.6;
      this.flash.scale.setScalar(0.6 + k * 2.4);
      this.glass.opacity = 0.13 + Math.sin(k * Math.PI) * 0.26;
      this.edgeMat.emissive.setRGB(0.5 * Math.sin(k * Math.PI), 0.32 * Math.sin(k * Math.PI), 0.05 * Math.sin(k * Math.PI));
    });
    // 2) the seal drops onto the glass
    const st = this.stamp;
    const stMats = st.material as THREE.Material[];
    for (const mm of stMats) mm.opacity = 1;
    st.visible = true;
    st.scale.setScalar(1);
    st.rotation.set(0, 0, 0);
    st.position.set(X, 3, Z0);
    const topY = 0.04 + GH + 0.1;
    await this.tween(0.32, (k) => {
      st.position.y = 3 - (3 - topY) * easeIn(k);
      st.rotation.y = (1 - k) * 1.4;
    });
    if (this.closed) return;
    // impact: a squash, dust, the pellets fuse into a solid block growing in the glass
    this.puff(new THREE.Vector3(X, topY, Z0), "#f6e2a8", 4, 0.9);
    void this.tween(0.18, (k) => st.scale.set(1 + Math.sin(k * Math.PI) * 0.25, 1 - Math.sin(k * Math.PI) * 0.4, 1 + Math.sin(k * Math.PI) * 0.25));
    const m = this.makeBlock(info, shielded);
    m.group.position.set(X, 0, Z0);
    m.group.scale.setScalar(0.25);
    this.mined.unshift(m);
    const restY = 0.06 + BH + 0.06;
    await this.tween(0.36, (k) => {
      m.group.scale.setScalar(0.25 + 0.75 * easeBack(k));
      this.glass.opacity = 0.13 * (1 - k);
      for (const i of fuse) {
        const p = this.pel[i];
        if (p) p.fuse = k;
      }
      this.pelDirty = true;
      st.position.y = topY + (restY - topY) * easeOut(k);
    });
    if (this.closed) return;
    for (const i of fuse) this.pel[i] = null;
    this.pelDirty = true;
    // 3) the chain moves one step down the rail; the seal rides on the new block
    const froms = this.mined.map((x) => x.group.position.z);
    const old = this.mined.length > KEEP ? this.mined.splice(KEEP) : [];
    const oldFrom = old.map((x) => x.group.position.z);
    await this.tween(0.55, (k) => {
      const e = easeInOut(k);
      this.mined.forEach((x, j) => (x.group.position.z = froms[j] + (slotZ(j) - froms[j]) * e));
      old.forEach((x, j) => (x.group.position.z = oldFrom[j] + (slotZ(KEEP + j) - oldFrom[j]) * e));
      st.position.z = m.group.position.z;
    });
    if (this.closed) return;
    // the oldest tips off the far end and falls
    for (const o of old) {
      this.falling.add(o);
      const z0 = o.group.position.z;
      this.puff(new THREE.Vector3(X, 0.2, z0), "#9a9084", 3, 0.7);
      void this.tween(0.5, (k) => {
        o.group.position.y = -1.9 * easeIn(k);
        o.group.position.z = z0 - 0.5 * k;
        o.group.rotation.x = -1.3 * easeIn(k);
        o.group.scale.setScalar(1 - 0.6 * k);
      }).then(() => {
        this.falling.delete(o);
        this.dropBlock(o);
      });
    }
    // 4) the seal sinks into the block's face, the glass comes back for the next one
    void this.tween(0.3, (k) => {
      st.scale.setScalar(1 - easeIn(k));
      for (const mm of stMats) mm.opacity = 1 - k;
    }).then(() => (st.visible = false));
    await this.tween(0.32, (k) => (this.glass.opacity = 0.13 * k));
  }

  private puff(p: THREE.Vector3, color: string, n: number, size: number) {
    for (let i = 0; i < n; i++) {
      const mat = new THREE.SpriteMaterial({ map: puffTex(), color, transparent: true, opacity: 0.55, depthWrite: false });
      const s = new THREE.Sprite(mat);
      s.position.copy(p).add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.05, (Math.random() - 0.5) * 0.5));
      s.scale.setScalar(size * 0.5);
      this.group.add(s);
      this.puffs.push({ s, t: 0, v: new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.5 + Math.random() * 0.5, (Math.random() - 0.5) * 1.2) });
    }
  }

  // ---- motion ------------------------------------------------------------------------------------------------

  private tween(dur: number, f: (k: number) => void): Promise<void> {
    return new Promise((done) => {
      if (this.closed) return done();
      this.tweens.push({ t: 0, dur, f, done });
    });
  }
  private later(delay: number, f: () => void) {
    void this.tween(delay, () => {}).then(() => !this.closed && f());
  }

  private tmpM = new THREE.Matrix4();
  private tmpQ = new THREE.Quaternion();
  private tmpV = new THREE.Vector3();
  private tmpS = new THREE.Vector3();
  private qa = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
  private qb = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));

  update(dt: number, t: number) {
    if (this.closed) return;
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.f(k);
      if (k >= 1) {
        this.tweens.splice(i, 1);
        tw.done();
      }
    }
    // the glass breathes; its scan line sweeps up and down
    this.pend.position.y = 0.04 + Math.sin(t * 1.7) * 0.025;
    this.scan.position.y = 0.1 + (0.5 + 0.5 * Math.sin(t * 1.3)) * (GH - 0.06);
    (this.scan.material as THREE.MeshBasicMaterial).opacity = 0.12 + 0.08 * Math.sin(t * 2.6);
    // pellets: flying in, landing, fusing
    let flying = false;
    for (let i = 0; i < CAP; i++) {
      const p = this.pel[i];
      if (p?.from && p.t < 1) {
        p.t = Math.min(1, p.t + dt / 0.7);
        flying = true;
      }
    }
    if (flying || this.pelDirty) {
      this.pelDirty = false;
      const M = this.tmpM,
        V = this.tmpV,
        S = this.tmpS;
      const home = new THREE.Vector3();
      for (let i = 0; i < CAP; i++) {
        const p = this.pel[i];
        if (!p) {
          M.makeScale(0, 0, 0);
          this.pellets.setMatrixAt(i, M);
          continue;
        }
        slotPos(i, home);
        let sc = 1;
        if (p.fuse >= 0) {
          // into the middle, shrinking
          V.copy(home).lerp(new THREE.Vector3(0, BH / 2 + 0.06, 0), easeIn(p.fuse));
          sc = 1 - easeIn(p.fuse);
        } else if (p.from && p.t < 1) {
          const k = easeInOut(p.t);
          V.copy(p.from).lerp(home, k);
          V.y += Math.sin(k * Math.PI) * 1.1;
          sc = 1.35 - 0.35 * k;
        } else {
          V.copy(home);
          if (p.from && p.t >= 1) {
            // it landed: a little pop, once
            p.from = null;
            p.t = 0;
            p.fuse = -2;
          }
          if (p.fuse <= -2) {
            p.fuse = Math.min(-1, p.fuse + dt * 6);
            sc = 1 + 0.25 * Math.sin(((p.fuse + 2) / 1) * Math.PI);
            this.pelDirty = true;
          }
        }
        S.setScalar(sc);
        M.compose(V, this.tmpQ.identity(), S);
        this.pellets.setMatrixAt(i, M);
      }
      this.pellets.instanceMatrix.needsUpdate = true;
    }
    // the links between neighbours on the rail
    const zs = [Z0, ...this.mined.map((m) => m.group.position.z)];
    let li = 0;
    for (let j = 0; j + 1 < zs.length; j++) {
      const a = zs[j],
        b = zs[j + 1];
      if (a - b > STEP * 1.4 || a - b < BD) continue;
      const mid = (a - BD / 2 + (b + BD / 2)) / 2;
      const y = 0.06 + BH * 0.55;
      this.links.setMatrixAt(li++, this.tmpM.compose(this.tmpV.set(X, y, mid - 0.09), this.qa, this.tmpS.setScalar(1)));
      this.links.setMatrixAt(li++, this.tmpM.compose(this.tmpV.set(X, y, mid + 0.09), this.qb, this.tmpS.setScalar(1)));
    }
    this.links.count = li;
    this.links.instanceMatrix.needsUpdate = true;
    // puffs
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const q = this.puffs[i];
      q.t += dt;
      q.s.position.addScaledVector(q.v, dt);
      q.s.scale.multiplyScalar(1 + dt * 1.6);
      (q.s.material as THREE.SpriteMaterial).opacity = Math.max(0, 0.55 * (1 - q.t / 0.8));
      if (q.t > 0.8) {
        q.s.removeFromParent();
        (q.s.material as THREE.SpriteMaterial).dispose();
        this.puffs.splice(i, 1);
      }
    }
    // the pending block's info and label
    const pi = this.pendInfo;
    pi.height = this.tipHeight ? this.tipHeight + 1 : 0;
    pi.txs = this.count();
    pi.time = this.tipTime;
    pi.fees = this.pel.reduce((s, p) => s + (p && p.fuse < 0 ? p.fee : 0), 0);
    this.paintLabel(Date.now());
  }

  // ---- for tests ----------------------------------------------------------------------------------------------

  /** A block mined now (takes everything in the glass). */
  fakeBlock(height?: number) {
    const h = height ?? (this.tipHeight || 3_600_000) + 1;
    const txs = this.pel.filter((p): p is Pellet => !!p && p.fuse < 0).map((p) => ({ txid: p.txid, kind: p.kind, fee: p.fee, size: 300, actions: 2, transparentOut: 0, seenAt: Date.now(), height: h }));
    const b: Block & { fake: boolean } = { height: h, time: Date.now(), size: 2000, fees: txs.reduce((s, x) => s + (x.fee ?? 0), 0), pool: "Luxor", txs, fake: true };
    this.enqueue(b);
  }
  /** A transaction seen in the mempool now. */
  fakeTx(kind?: TxKind) {
    const k = kind ?? KINDS.filter((x) => x !== "coinbase")[Math.floor(Math.random() * 6)];
    this.addTx({ txid: `fake-${Math.random().toString(36).slice(2)}`, kind: k, fee: 10000, size: 300, actions: 2, transparentOut: 0, seenAt: Date.now() });
  }

  dispose() {
    this.closed = true;
    this.closeFeed?.();
    clearInterval(this.poll);
    for (const tw of this.tweens) tw.done();
    this.tweens = [];
    for (const m of [...this.mined, ...this.falling]) this.dropBlock(m);
    this.mined = [];
    this.falling.clear();
    for (const q of this.puffs) (q.s.material as THREE.SpriteMaterial).dispose();
    this.puffs = [];
    this.pellets?.dispose();
    this.edges?.dispose();
    this.links?.dispose();
    for (const d of this.disposables) d.dispose();
    this.group.removeFromParent();
  }
}
