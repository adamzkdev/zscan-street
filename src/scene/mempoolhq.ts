import * as THREE from "three";
import type { Tx } from "../data/types";
import { mempoolStats } from "../ui/stores";
import type { City, LiveBoard, ShopSite } from "./city";
import type { Director } from "./director";
import { KIND_COLOR, type Snark } from "./snark";

const ORANGE = "#ff9f2e",
  TEAL = "#3ec9b0";
const MONO = `"JetBrains Mono", "SF Mono", ui-monospace, Menlo, monospace`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const kb = (b: number) => (b >= 1e6 ? `${(b / 1e6).toFixed(2)} MB` : `${(b / 1000).toFixed(1)} kB`);
const ago = (ms: number) => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  return s < 90 ? `${s}s` : s < 5400 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`;
};

interface Board {
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  at: THREE.Vector3;
  kind: "hq" | "branch";
  name: string;
  next: number;
}

interface Branch {
  door: THREE.Vector3;
  out: THREE.Vector3;
  along: THREE.Vector3;
  busy: number;
  next: number;
}

/**
 * The MEMPOOL chain, live: the HQ's big board over the pickup hall and each branch's roof counter
 * (pending transactions, their size, the shielded share, a bar per transaction), the hands in the
 * HQ's loading dock carrying parcels from the pallets to the pass, and customers coming and going
 * at the branches.
 */
export class MempoolLive {
  private boards: Board[] = [];
  private branches: Branch[] = [];
  private hq: ShopSite | null;
  private t = 0;
  private alive = true;

  constructor(
    city: City,
    private director: Director,
  ) {
    this.hq = city.shops[0] ?? null;
    if (this.hq?.screen) this.addBoard(this.hq.screen, this.hq.occluder.extras, "hq", "HQ");
    for (const st of city.stores) {
      if (!st.id.startsWith("mempool-") || !st.screen) continue;
      this.addBoard(st.screen, st.occluder.extras, "branch", st.name.replace(/^MEMPOOL · /, ""));
      const out = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), st.screen.yaw);
      this.branches.push({ door: st.door.clone(), out, along: new THREE.Vector3(out.z, 0, -out.x), busy: 0, next: Math.random() * 4 });
    }
    if (this.hq?.dock) for (const [k, id] of [3301, 4417].entries()) void this.hand(id, k);
  }

  private addBoard(b: LiveBoard, parent: THREE.Object3D, kind: Board["kind"], name: string) {
    const c = document.createElement("canvas");
    c.width = kind === "hq" ? 1024 : 512;
    c.height = Math.round((c.width * b.h) / b.w);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    parent.updateMatrixWorld(true);
    mesh.position.copy(parent.worldToLocal(b.at.clone()));
    mesh.rotation.y = b.yaw;
    parent.add(mesh);
    const board: Board = { ctx: c.getContext("2d")!, tex, at: b.at.clone(), kind, name, next: 0 };
    this.boards.push(board);
    this.draw(board);
  }

  private draw(b: Board) {
    const g = b.ctx,
      W = g.canvas.width,
      H = g.canvas.height;
    const txs = this.director.mempoolList();
    const s = mempoolStats(txs);
    g.fillStyle = "#07060a";
    g.fillRect(0, 0, W, H);
    // a faint LED grid
    g.fillStyle = "rgba(255,255,255,0.025)";
    for (let x = 0; x < W; x += 4) g.fillRect(x, 0, 1, H);
    g.textBaseline = "alphabetic";
    if (b.kind === "hq") {
      g.fillStyle = ORANGE;
      g.font = `800 44px ${MONO}`;
      g.fillText("MEMPOOL", 28, 58);
      g.fillStyle = TEAL;
      g.font = `600 28px ${MONO}`;
      g.fillText("待機中 · PENDING TX", 250, 56);
      g.fillStyle = "#8a8496";
      g.textAlign = "right";
      g.fillText(new Date().toLocaleTimeString("en-GB"), W - 28, 56);
      g.textAlign = "left";
      // the count, big
      g.fillStyle = "#fff4e0";
      g.font = `800 200px ${MONO}`;
      const n = String(s.count);
      g.fillText(n, 24, 260);
      const nw = g.measureText(n).width;
      g.fillStyle = ORANGE;
      g.font = `700 44px ${MONO}`;
      g.fillText("tx", 40 + nw, 256);
      // the figures on the right
      const rows: [string, string][] = [
        ["SIZE", kb(s.bytes)],
        ["SHIELDED", s.shieldedPct === null ? "—" : `${s.shieldedPct}%`],
        ["FEES", `${(s.fees / 1e8).toFixed(5)} ZEC`],
        ["OLDEST", s.oldest ? ago(s.oldest) : "—"],
      ];
      rows.forEach(([k, v], i) => {
        const y = 112 + i * 50;
        g.fillStyle = "#a8a2b4";
        g.font = `600 28px ${MONO}`;
        g.fillText(k, 520, y);
        g.fillStyle = i === 1 ? TEAL : "#fff4e0";
        g.font = `700 40px ${MONO}`;
        g.textAlign = "right";
        g.fillText(v, W - 28, y);
        g.textAlign = "left";
      });
      // one bar per transaction, its height its size, its colour its kind
      this.bars(g, txs, 28, 300, W - 56, H - 330);
    } else {
      g.fillStyle = ORANGE;
      g.font = `800 34px ${MONO}`;
      g.fillText("MEMPOOL", 18, 46);
      g.fillStyle = TEAL;
      g.font = `600 20px ${MONO}`;
      g.fillText(b.name.toUpperCase(), 18, 74);
      g.fillStyle = "#fff4e0";
      g.font = `800 92px ${MONO}`;
      g.textAlign = "right";
      g.fillText(String(s.count), W - 120, 92);
      g.fillStyle = ORANGE;
      g.font = `700 26px ${MONO}`;
      g.textAlign = "left";
      g.fillText("tx", W - 110, 90);
      g.fillStyle = "#8a8496";
      g.font = `600 18px ${MONO}`;
      g.fillText(`${kb(s.bytes)} · ${s.shieldedPct === null ? "—" : `${s.shieldedPct}%`} shielded`, 18, 120);
      this.bars(g, txs, 18, 132, W - 36, H - 142);
    }
    b.tex.needsUpdate = true;
  }

  private bars(g: CanvasRenderingContext2D, txs: Tx[], x: number, y: number, w: number, h: number) {
    g.fillStyle = "rgba(255,255,255,0.06)";
    g.fillRect(x, y + h - 2, w, 2);
    if (!txs.length) return;
    const list = txs.slice(-60);
    const max = Math.max(...list.map((t) => t.size), 1);
    const bw = Math.min(28, w / list.length);
    list.forEach((t, i) => {
      const bh = Math.max(4, (t.size / max) * (h - 4));
      g.fillStyle = KIND_COLOR[t.kind] ?? ORANGE;
      g.fillRect(x + i * bw, y + h - 2 - bh, Math.max(2, bw - 3), bh);
    });
  }

  /** A pending transaction to carry (null when the mempool is empty). */
  private anyTx(): Tx | null {
    const list = this.director.rackTxs();
    const pool = list.length ? list : this.director.mempoolList();
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  }

  /** A dock hand: from the pallets by the roller door to the pass into the hall, with a parcel each way in. */
  private async hand(id: number, k: number) {
    const dock = this.hq?.dock;
    if (!dock) return;
    let s: Snark;
    try {
      s = await this.director.newSnark(id);
    } catch {
      return;
    }
    this.director.adopt(s);
    s.role = "Dock hand";
    s.noClip = true;
    const side = new THREE.Vector3(k ? 0.5 : -0.5, 0, 0);
    s.root.position.copy(dock.pallet).add(side);
    await sleep(800 + k * 2600);
    while (this.alive) {
      const tx = this.anyTx();
      if (tx) {
        s.setTxs([tx]);
        s.showParcels(true);
      }
      await s.walk([dock.bay.clone().add(side), dock.pass.clone().add(side.clone().multiplyScalar(0.4))], 1.2);
      s.showParcels(false);
      s.setTxs([]);
      s.faceDir = new THREE.Vector3(-1, 0, 0);
      await sleep(900 + Math.random() * 900);
      s.faceDir = null;
      await s.walk([dock.bay.clone().add(side), dock.pallet.clone().add(side)], 1.3);
      s.faceDir = new THREE.Vector3(0, 0, 1);
      await sleep(1500 + Math.random() * 2500);
      s.faceDir = null;
    }
  }

  /** A customer at a branch: along the pavement, in at the door, out with a parcel, off the other way. */
  private async customer(b: Branch) {
    b.busy++;
    let s: Snark | null = null;
    try {
      s = await this.director.newSnark(1 + Math.floor(Math.random() * 10000));
      const dir = Math.random() > 0.5 ? 1 : -1;
      const kerb = b.door.clone().addScaledVector(b.out, 1.4 + Math.random() * 0.5);
      s.root.position.copy(kerb).addScaledVector(b.along, 8 * dir);
      this.director.adopt(s);
      s.role = "Customer";
      s.noClip = true;
      await s.walk([kerb, b.door.clone().addScaledVector(b.out, 0.5)], 1.5);
      s.faceDir = b.out.clone().negate();
      await sleep(1600 + Math.random() * 1600);
      const tx = this.anyTx();
      if (tx) {
        s.setTxs([tx]);
        s.showParcels(true);
      }
      s.faceDir = null;
      await s.walk([kerb.clone().addScaledVector(b.along, -2 * dir), kerb.clone().addScaledVector(b.along, -9 * dir)], 1.7);
    } catch {}
    if (s) {
      s.setTxs([]);
      this.director.release(s);
    }
    b.busy--;
  }

  update(dt: number, focus: THREE.Vector3, wide: boolean) {
    this.t += dt;
    for (const b of this.boards) {
      if (this.t < b.next) continue;
      const d = b.at.distanceTo(focus);
      // only the boards someone could be reading are redrawn
      b.next = this.t + (wide ? 4 : d < 80 ? 1 : d < 200 ? 3 : 8);
      if (wide || d < 200) this.draw(b);
    }
    if (wide) return;
    for (const b of this.branches) {
      if (this.t < b.next) continue;
      b.next = this.t + 5 + Math.random() * 7;
      if (b.busy < 2 && b.door.distanceTo(focus) < 70) void this.customer(b);
    }
  }

  dispose() {
    this.alive = false;
  }
}
