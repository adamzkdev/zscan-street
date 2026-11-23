/**
 * ZK JUMP: your own zkSNARK flaps over ZStreet at night, between columns of blocks (each capped with
 * a block height, counting up from the chain's latest). A touch is the end. Every column passed is a
 * point, every ⓩ grabbed one more; the street speeds up and the gaps close as you go.
 */
import { T } from "../../i18n/lang";
import { ZScan } from "../../data/zscan";
import { portraitImage } from "../../data/portrait";
import { chainSeed, lastChainSeed } from "../chain";
import { rng, sfx } from "../kit";
import type { ArcadeHost, ArcadeMake } from "./runner";

/** The view's height in its own units (its width follows the screen). */
const VH = 600;
const GROUND = 70;
const G = 1750;
const FLAP = -540;
const SIZE = 46;
const HIT = 17;
const COL_W = 74;
const CUBE = 37;

interface Col {
  x: number;
  gapY: number;
  gap: number;
  h: number;
  hue: number;
  passed: boolean;
  coin: boolean;
}

class Jump {
  private cv: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private ro: ResizeObserver;
  private rnd: () => number;
  private vw = 900;
  private k = 1;
  private dpr = 1;
  private y = VH * 0.42;
  private vy = 0;
  private x = 0;
  private cols: Col[] = [];
  private dist = 0;
  private score = 0;
  private coins = 0;
  private state: "ready" | "fly" | "fall" | "over" = "ready";
  private t = 0;
  private fallT = 0;
  private shake = 0;
  private height: number;
  private raf = 0;
  private last = 0;
  private paused = false;
  private me: HTMLCanvasElement | null = null;
  private stars: [number, number, number][] = [];
  private skyline: { far: number[]; near: number[] };
  private bits: { x: number; y: number; vx: number; vy: number; c: string; life: number }[] = [];
  private pops: { x: number; y: number; s: string; life: number }[] = [];

  constructor(private host: ArcadeHost) {
    this.rnd = rng(host.seed);
    this.height = (lastChainSeed()?.height ?? 3_600_000) + 1;
    // (no block read yet: the next columns take the chain's real height once it comes)
    if (!lastChainSeed())
      void chainSeed(3000).then((s) => {
        if (s) this.height = s.height + 1 + this.cols.length;
      }, () => {});
    this.cv = document.createElement("canvas");
    this.cv.className = "jp-cv";
    host.el.append(this.cv);
    this.g = this.cv.getContext("2d")!;
    for (let i = 0; i < 90; i++) this.stars.push([this.rnd(), this.rnd() * 0.7, this.rnd()]);
    const line = (n: number, lo: number, hi: number) => Array.from({ length: n }, () => lo + this.rnd() * (hi - lo));
    this.skyline = { far: line(40, 0.18, 0.42), near: line(30, 0.12, 0.3) };
    this.ro = new ResizeObserver(() => this.fit());
    this.ro.observe(host.el);
    this.fit();
    void portraitImage(ZScan.zkSnarkImage(host.me)).then((im) => {
      // (the art cut to its pixels: 26 × 26, drawn big and sharp)
      const c = document.createElement("canvas");
      c.width = c.height = 26;
      const g = c.getContext("2d")!;
      g.imageSmoothingEnabled = false;
      g.drawImage(im, 0, 0, 26, 26);
      this.me = c;
    }, () => {});
    this.cv.addEventListener("pointerdown", this.onTap);
    window.addEventListener("keydown", this.onKey, true);
    host.status(T("Tap, click or Space to flap", "轻触、点击或空格键扑腾"));
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  private fit() {
    const w = this.host.el.clientWidth,
      h = this.host.el.clientHeight;
    if (!w || !h) return;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.k = h / VH;
    this.vw = w / this.k;
    this.cv.style.width = `${w}px`;
    this.cv.style.height = `${h}px`;
    this.cv.width = Math.round(w * this.dpr);
    this.cv.height = Math.round(h * this.dpr);
    this.x = Math.min(this.vw * 0.3, 260);
  }

  private onTap = (e: PointerEvent) => {
    e.preventDefault();
    this.flap();
  };
  private onKey = (e: KeyboardEvent) => {
    if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW" || e.code === "KeyZ" || e.code === "Enter") {
      e.preventDefault();
      if (!e.repeat) this.flap();
    }
  };

  private flap() {
    if (this.paused) return;
    if (this.state === "ready") {
      this.state = "fly";
      this.host.status("");
    }
    if (this.state !== "fly") return;
    this.vy = FLAP;
    sfx.blip(3 + Math.min(4, this.score / 10));
  }

  /** How hard it is now: the speed, the gap, the spacing. */
  private pace() {
    const s = Math.min(1, this.score / 45);
    return { speed: 200 + 120 * s, gap: 205 - 55 * s, every: 270 - 40 * s };
  }

  private spawn(x: number) {
    const p = this.pace();
    const lo = 70 + p.gap / 2,
      hi = VH - GROUND - 60 - p.gap / 2;
    const prev = this.cols[this.cols.length - 1];
    let gy = lo + this.rnd() * (hi - lo);
    // (never a wall too far from the last gap to reach)
    if (prev) gy = Math.max(prev.gapY - 230, Math.min(prev.gapY + 230, gy));
    this.cols.push({ x, gapY: gy, gap: p.gap, h: this.height++, hue: Math.floor(this.rnd() * 6), passed: false, coin: this.rnd() < 0.45 });
  }

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.033, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (!this.paused) this.step(dt);
    this.paint();
  };

  private step(dt: number) {
    this.t += dt;
    const p = this.pace();
    if (this.state === "ready") {
      this.y = VH * 0.42 + Math.sin(this.t * 3) * 10;
      this.dist += 120 * dt;
      return;
    }
    if (this.state === "fly") {
      this.dist += p.speed * dt;
      for (const c of this.cols) c.x -= p.speed * dt;
      this.cols = this.cols.filter((c) => c.x > -COL_W - 20);
      const lastX = this.cols.length ? this.cols[this.cols.length - 1].x : this.vw * 0.75;
      if (!this.cols.length || lastX < this.vw + 40 - p.every) this.spawn(Math.max(this.vw + 40, lastX + p.every));
    }
    this.vy = Math.min(900, this.vy + G * dt);
    this.y += this.vy * dt;
    if (this.state === "fly") {
      for (const c of this.cols) {
        // a point once past it, a ⓩ in its gap
        if (!c.passed && c.x + COL_W < this.x - HIT) {
          c.passed = true;
          this.score++;
          this.host.score(this.score);
          sfx.tick();
        }
        if (c.coin && Math.hypot(c.x + COL_W / 2 - this.x, c.gapY - this.y) < HIT + 14) {
          c.coin = false;
          this.coins++;
          this.score++;
          this.host.score(this.score);
          sfx.coin();
          this.pops.push({ x: c.x + COL_W / 2, y: c.gapY - 20, s: "+1", life: 0.8 });
        }
        // the hit: the bird's round against the column's two boxes
        const inX = this.x + HIT > c.x && this.x - HIT < c.x + COL_W;
        if (inX && (this.y - HIT < c.gapY - c.gap / 2 || this.y + HIT > c.gapY + c.gap / 2)) this.crash();
      }
      if (this.y + HIT > VH - GROUND || this.y < -40) this.crash();
    }
    if (this.state === "fall") {
      this.fallT += dt;
      if (this.y + HIT > VH - GROUND) {
        this.y = VH - GROUND - HIT;
        this.vy = 0;
      }
      if (this.fallT > 0.9) {
        this.state = "over";
        this.host.over({ score: this.score, line: T(`${this.score - this.coins} blocks · ${this.coins} ⓩ`, `${this.score - this.coins} 个区块 · ${this.coins} 个 ⓩ`) });
      }
    }
    for (const b of this.bits) ((b.vy += 900 * dt), (b.x += b.vx * dt), (b.y += b.vy * dt), (b.life -= dt));
    this.bits = this.bits.filter((b) => b.life > 0);
    for (const q of this.pops) ((q.y -= 50 * dt), (q.life -= dt));
    this.pops = this.pops.filter((q) => q.life > 0);
    this.shake *= Math.exp(-7 * dt);
  }

  private crash() {
    if (this.state !== "fly") return;
    this.state = "fall";
    this.fallT = 0;
    this.shake = 1;
    this.vy = Math.min(this.vy, -200);
    sfx.hit();
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2,
        v = 120 + Math.random() * 260;
      this.bits.push({ x: this.x, y: this.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, c: ["#ffd23f", "#ff6b35", "#ffffff"][i % 3], life: 0.5 + Math.random() * 0.5 });
    }
  }

  // ---- drawing ---------------------------------------------------------------------------------

  private paint() {
    const g = this.g;
    const k = this.k * this.dpr;
    g.setTransform(1, 0, 0, 1, 0, 0);
    const sx = (Math.random() - 0.5) * this.shake * 12;
    const sy = (Math.random() - 0.5) * this.shake * 12;
    g.setTransform(k, 0, 0, k, sx * k, sy * k);
    const W = this.vw;
    // the night: a deep sky, pixel stars
    const sky = g.createLinearGradient(0, 0, 0, VH);
    sky.addColorStop(0, "#0a0718");
    sky.addColorStop(0.6, "#1a1238");
    sky.addColorStop(1, "#2b1a48");
    g.fillStyle = sky;
    g.fillRect(-20, -20, W + 40, VH + 40);
    for (const [x, y, s] of this.stars) {
      const tw = 0.5 + 0.5 * Math.sin(this.t * (1 + s * 2) + s * 10);
      g.fillStyle = `rgba(255,255,255,${0.25 + 0.5 * tw * s})`;
      const px = (((x * W * 1.5 - this.dist * 0.03) % (W * 1.5)) + W * 1.5) % (W * 1.5);
      g.fillRect(px, y * VH, s > 0.8 ? 3 : 2, s > 0.8 ? 3 : 2);
    }
    // the city: two layers of towers, their windows lit
    this.towers(this.skyline.far, 0.15, 64, "#1c1436", "rgba(255,210,63,0.35)");
    this.towers(this.skyline.near, 0.4, 52, "#120d24", "rgba(62,198,255,0.45)");
    // the columns of blocks
    for (const c of this.cols) this.column(c);
    // the street
    g.fillStyle = "#0d0a17";
    g.fillRect(-20, VH - GROUND, W + 40, GROUND + 20);
    g.fillStyle = "#2a2540";
    g.fillRect(-20, VH - GROUND, W + 40, 4);
    g.fillStyle = "#ffd23f";
    const off = -(this.dist % 60);
    for (let x = off; x < W + 60; x += 60) g.fillRect(x, VH - GROUND / 2, 30, 4);
    // the zkSNARK
    this.bird();
    for (const b of this.bits) {
      g.globalAlpha = Math.min(1, b.life * 2);
      g.fillStyle = b.c;
      g.fillRect(b.x - 3, b.y - 3, 6, 6);
    }
    g.globalAlpha = 1;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = "400 26px DotGothic16, monospace";
    for (const q of this.pops) {
      g.globalAlpha = Math.min(1, q.life * 2);
      g.lineWidth = 5;
      g.strokeStyle = "#07060c";
      g.strokeText(q.s, q.x, q.y);
      g.fillStyle = "#ffd23f";
      g.fillText(q.s, q.x, q.y);
    }
    g.globalAlpha = 1;
    // the big score, and the start
    if (this.state !== "ready") {
      g.font = "400 64px DotGothic16, monospace";
      g.lineWidth = 8;
      g.strokeStyle = "#07060c";
      g.strokeText(String(this.score), W / 2, 70);
      g.fillStyle = "#ffffff";
      g.fillText(String(this.score), W / 2, 70);
    } else {
      const a = 0.65 + 0.35 * Math.sin(this.t * 4);
      g.globalAlpha = a;
      g.font = "400 30px DotGothic16, monospace";
      g.lineWidth = 6;
      g.strokeStyle = "#07060c";
      const s = T("TAP TO FLAP", "轻触起飞");
      g.strokeText(s, W / 2, VH * 0.62);
      g.fillStyle = "#3ec6ff";
      g.fillText(s, W / 2, VH * 0.62);
      g.globalAlpha = 1;
    }
  }

  private towers(hs: number[], par: number, w: number, color: string, lit: string) {
    const g = this.g;
    const W = this.vw;
    const span = hs.length * w;
    const off = -((this.dist * par) % span);
    for (let rep = 0; rep < 3; rep++) {
      for (let i = 0; i < hs.length; i++) {
        const x = off + rep * span + i * w;
        if (x > W + w || x < -w) continue;
        const h = hs[i] * VH;
        const top = VH - GROUND - h;
        g.fillStyle = color;
        g.fillRect(x, top, w - 6, h);
        g.fillStyle = lit;
        for (let wy = top + 10; wy < VH - GROUND - 10; wy += 14)
          for (let wx = x + 7; wx < x + w - 14; wx += 11) if (((wx * 7 + wy * 13 + i) | 0) % 5 === 0) g.fillRect(wx, wy, 4, 5);
      }
    }
  }

  /** A column: two stacks of voxel blocks, the gap between, its cap's block height. */
  private column(c: Col) {
    const g = this.g;
    const HUES = [
      ["#ff6b35", "#c44a1f", "#ffb38f"],
      ["#3ec6ff", "#1d7fb0", "#a6e6ff"],
      ["#8ee35b", "#4f9a2a", "#cdf5b0"],
      ["#b18cff", "#6e4fc0", "#ddd0ff"],
      ["#ffd23f", "#b8901a", "#fff0b0"],
      ["#ff5fa2", "#b0336a", "#ffc0db"],
    ][c.hue];
    const top = c.gapY - c.gap / 2,
      bot = c.gapY + c.gap / 2;
    const cube = (y: number, cap: boolean) => {
      g.fillStyle = HUES[1];
      g.fillRect(c.x, y, COL_W, CUBE);
      g.fillStyle = HUES[0];
      g.fillRect(c.x + 4, y + 4, COL_W - 8, CUBE - 8);
      g.fillStyle = HUES[2];
      g.fillRect(c.x + 4, y + 4, COL_W - 8, 4);
      if (cap) {
        g.fillStyle = "#07060c";
        g.font = "400 12px DotGothic16, monospace";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(`#${c.h.toLocaleString("en-US")}`, c.x + COL_W / 2, y + CUBE / 2 + 1);
      }
    };
    for (let y = top - CUBE; y > -CUBE; y -= CUBE) cube(y, y === top - CUBE);
    for (let y = bot; y < VH - GROUND; y += CUBE) cube(y, y === bot);
    if (c.coin) {
      const bob = Math.sin(this.t * 5 + c.x * 0.02) * 4;
      const cx = c.x + COL_W / 2,
        cy = c.gapY + bob;
      const sq = Math.abs(Math.cos(this.t * 3 + c.x));
      g.fillStyle = "#b8901a";
      g.beginPath();
      g.ellipse(cx, cy, 13 * Math.max(0.25, sq), 13, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#ffd23f";
      g.beginPath();
      g.ellipse(cx, cy, 10 * Math.max(0.2, sq), 10, 0, 0, Math.PI * 2);
      g.fill();
      if (sq > 0.5) {
        g.fillStyle = "#8a5a00";
        g.font = "700 13px Geist, system-ui, sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText("Z", cx, cy + 1);
      }
    }
  }

  private bird() {
    const g = this.g;
    const tilt = this.state === "ready" ? 0 : Math.max(-0.5, Math.min(1.3, this.vy / 700));
    g.save();
    g.translate(this.x, this.y);
    g.rotate(tilt);
    // a flap: the body squashes on each beat
    const sq = this.vy < -200 ? 0.9 : 1;
    g.scale(1 / sq, sq);
    g.fillStyle = "#07060c";
    g.fillRect(-SIZE / 2 - 3, -SIZE / 2 - 3, SIZE + 6, SIZE + 6);
    if (this.me) {
      g.imageSmoothingEnabled = false;
      g.drawImage(this.me, -SIZE / 2, -SIZE / 2, SIZE, SIZE);
    } else {
      g.fillStyle = "#ff6b35";
      g.fillRect(-SIZE / 2, -SIZE / 2, SIZE, SIZE);
    }
    // its little wing
    const wing = this.vy < 0 ? -1 : 1;
    g.fillStyle = "#ffffff";
    g.fillRect(-SIZE / 2 - 10, -2 + wing * 6, 12, 8);
    g.fillStyle = "#07060c";
    g.fillRect(-SIZE / 2 - 10, 6 + wing * 6, 12, 2);
    g.restore();
  }

  pause(on: boolean) {
    this.paused = on;
    this.last = performance.now();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    window.removeEventListener("keydown", this.onKey, true);
    this.cv.remove();
  }
}

const make: ArcadeMake = (host) => new Jump(host);
export default make;
