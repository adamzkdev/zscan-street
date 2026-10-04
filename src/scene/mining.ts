import * as THREE from "three";
import { Market } from "../data/market";
import { fitText } from "./fit";
import { get } from "../data/zscan";
import type { FactorySite } from "./city";

interface Miners {
  total_blocks: number;
  miners: { pool: string | null; tag: string | null; address: string; blocks: number }[];
}

/**
 * The live wall of the mining hall: hashrate, difficulty, the last block and who found it, the
 * pools' share of the last week. It flashes when a block is found.
 */
export class MiningHall {
  private ctx: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private miners: Miners | null = null;
  private last: { height: number; pool: string | null; at: number } | null = null;
  private flashUntil = 0;
  private lastDraw = 0;
  private glow: THREE.PointLight;
  /** Block boxes on their way down the conveyor. */
  private boxes: { mesh: THREE.Mesh; t: number }[] = [];

  constructor(
    private parent: THREE.Object3D,
    private site: FactorySite,
  ) {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 256;
    this.ctx = c.getContext("2d")!;
    this.tex = new THREE.CanvasTexture(c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    const w = 2.6,
      h = 1.3;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false, color: new THREE.Color(1.2, 1.2, 1.2) }));
    screen.position.copy(site.screen);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, h + 0.12, 0.08), new THREE.MeshStandardMaterial({ color: "#121117", metalness: 0.5, roughness: 0.4 }));
    frame.position.copy(site.screen).add(new THREE.Vector3(0, 0, -0.05));
    // two legs to the floor
    const legM = new THREE.MeshStandardMaterial({ color: "#2a2832" });
    for (const dx of [-w / 3, w / 3]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, site.screen.y - h / 2 - site.hall.y, 0.08), legM);
      leg.position.set(site.screen.x + dx, (site.screen.y - h / 2 + site.hall.y) / 2, site.screen.z - 0.06);
      parent.add(leg);
    }
    this.glow = new THREE.PointLight("#3ddc97", 0, 7, 1.6);
    this.glow.position.copy(site.screen).add(new THREE.Vector3(0, 0, 1));
    parent.add(frame, screen, this.glow);
    void this.loadMiners();
    setInterval(() => void this.loadMiners(), 5 * 60_000);
  }

  private async loadMiners() {
    this.miners = (await get<Miners>("/v1/miners")) ?? this.miners;
  }

  /** A block was found (the bus is on its way): the press stamps it and the belt carries it off. */
  found(height: number, pool: string | null) {
    this.last = { height, pool, at: Date.now() };
    this.flashUntil = performance.now() + 4500;
    const mats = [0, 1, 2, 3, 4, 5].map((f) => new THREE.MeshStandardMaterial({ color: "#f4b728", roughness: 0.45, metalness: 0.3, emissive: "#3a2600", map: f === 4 || f === 2 ? boxLabel(height) : null }));
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.36, 0.36), mats);
    mesh.castShadow = true;
    mesh.position.copy(this.site.press);
    this.parent.add(mesh);
    this.boxes.push({ mesh, t: 0 });
  }

  setLast(height: number, pool: string | null, at: number) {
    if (!this.last || this.last.height < height) this.last = { height, pool, at };
  }

  update(t: number, dt = 0) {
    // boxes: out of the press (1 s), down the belt (5 s), then lifted off toward the bay
    for (const b of [...this.boxes]) {
      b.t += dt;
      const { press, beltEnd } = this.site;
      const m = b.mesh;
      if (b.t < 1) m.position.copy(press).setY(press.y + 0.18 + (1 - b.t) * 0.25);
      else if (b.t < 6) m.position.lerpVectors(press, beltEnd, (b.t - 1) / 5).setY(press.y + 0.18);
      else if (b.t < 8) {
        const k = (b.t - 6) / 2;
        m.position.copy(beltEnd).add(new THREE.Vector3(-k * 0.8, 0.18 + Math.sin(k * Math.PI) * 0.8, k * 2.2));
        m.scale.setScalar(1 - k * 0.6);
      } else {
        this.parent.remove(m);
        (m.material as THREE.Material[]).forEach((x) => x.dispose());
        this.boxes.splice(this.boxes.indexOf(b), 1);
      }
    }
    if (t - this.lastDraw < 0.25) return;
    this.lastDraw = t;
    const ctx = this.ctx,
      W = 512,
      H = 256;
    const flash = performance.now() < this.flashUntil;
    ctx.fillStyle = flash ? "#2a2006" : "#05070a";
    ctx.fillRect(0, 0, W, H);
    const mono = (px: number, wgt = 600) => `${wgt} ${px}px "JetBrains Mono", Menlo, monospace`;
    if (flash) {
      const k = Math.sin(t * 12) > 0;
      ctx.fillStyle = k ? "#f4b728" : "#ffe08a";
      ctx.font = mono(54, 800);
      ctx.textAlign = "center";
      fitText(ctx, "BLOCK FOUND", W / 2, 110);
      ctx.font = mono(30, 700);
      fitText(ctx, this.last ? `#${this.last.height.toLocaleString("en-US")}` : "", W / 2, 158);
      ctx.fillStyle = "#e8e0c8";
      ctx.font = mono(20, 500);
      fitText(ctx, this.last?.pool ?? "solo / unknown miner", W / 2, 196);
      ctx.textAlign = "left";
      this.glow.color.set("#f4b728");
      this.glow.intensity = 6;
    } else {
      this.glow.color.set("#3ddc97");
      this.glow.intensity = 2.2;
      const n = Market.state.network;
      ctx.fillStyle = "#3ddc97";
      ctx.font = mono(16);
      fitText(ctx, "MINING HALL · EQUIHASH 200,9", 18, 30);
      ctx.fillStyle = Math.sin(t * 4) > 0 ? "#3ddc97" : "#0f3a2a";
      ctx.fillRect(W - 30, 18, 12, 12);
      ctx.fillStyle = "#ffffff";
      ctx.font = mono(52, 800);
      const hw = fitText(ctx, n ? `${(n.solps / 1e9).toFixed(2)}` : "—", 18, 92, W * 0.62);
      ctx.fillStyle = "#7a8a84";
      ctx.font = mono(18);
      fitText(ctx, "GSol/s", 18 + hw + 10, 92);
      ctx.fillStyle = "#a3a3a3";
      ctx.font = mono(15, 500);
      fitText(ctx, n ? `difficulty ${(n.difficulty / 1e6).toFixed(1)}M · block ${n.avg_block_time.toFixed(0)}s avg` : "", 18, 120);
      if (this.last) {
        const ago = Math.max(0, Math.round((Date.now() - this.last.at) / 1000));
        ctx.fillStyle = "#f4b728";
        fitText(ctx, `last #${this.last.height.toLocaleString("en-US")} · ${ago}s ago · ${this.last.pool ?? "unknown"}`, 18, 146);
      }
      // the pools' share of the last week
      const list = this.miners?.miners.slice(0, 5) ?? [];
      const tot = this.miners?.total_blocks || 1;
      list.forEach((m, i) => {
        const y = 168 + i * 17;
        const share = m.blocks / tot;
        ctx.fillStyle = "#1a2a24";
        ctx.fillRect(150, y - 10, 300, 10);
        ctx.fillStyle = i === 0 ? "#f4b728" : "#3ddc97";
        ctx.fillRect(150, y - 10, 300 * share, 10);
        ctx.fillStyle = "#c8d0cc";
        ctx.font = mono(12, 500);
        fitText(ctx, (m.pool ?? m.tag ?? `${m.address.slice(0, 8)}…`).slice(0, 16), 18, y);
        fitText(ctx, `${Math.round(share * 100)}%`, 458, y);
      });
    }
    // scan lines
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
    this.tex.needsUpdate = true;
  }
}

/** The block height stamped on the box. */
function boxLabel(height: number) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#f4b728";
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = "#0d0d0d";
  ctx.fillRect(8, 38, 112, 52);
  ctx.fillStyle = "#f4b728";
  ctx.font = '700 22px "JetBrains Mono", monospace';
  ctx.textAlign = "center";
  fitText(ctx, height.toLocaleString("en-US"), 64, 72);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
