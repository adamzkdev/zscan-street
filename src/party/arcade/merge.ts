/**
 * ZK MERGE: drop round Apparitions into a jar; two alike that touch merge into the next one up.
 * Eleven of the 26 Apparitions make the ladder, small to big (Venom, then Aura, then Mirage); two
 * of the last one together burst and clear the way. The jar must not fill past the red line.
 *
 * A little circle physics of its own (fixed steps, position pushes and impulses), drawn on one
 * canvas; the ladder and the next one beside it in the DOM.
 */
import { T } from "../../i18n/lang";
import { snarkCells } from "../../scene/snarkbody";
import { rng, sfx } from "../kit";
import type { ArcadeHost, ArcadeMake } from "./runner";

/** The jar, in its own units. */
const W = 400;
const H = 600;
/** Over this line too long and it's over. */
const LINE = 104;
/** Where the next one hangs before it drops. */
const HANG = 50;
const G = 1500;
const STEP = 1 / 180;

interface Tier {
  item: number;
  name: string;
  r: number;
  ring: string;
}
/** The ladder: eleven Apparitions (their zkSNARKs # in the collection), each bigger than the last. */
const TIERS: Tier[] = [
  { item: 9868, name: "Apparition 02", r: 15, ring: "#ff3b5c" },
  { item: 9866, name: "Apparition 03", r: 20, ring: "#ff8a1f" },
  { item: 9865, name: "Apparition 04", r: 26, ring: "#9b5cff" },
  { item: 9729, name: "Apparition 08", r: 33, ring: "#ffd60a" },
  { item: 9850, name: "Apparition 05", r: 41, ring: "#5fdc2e" },
  { item: 9723, name: "Apparition 10", r: 50, ring: "#22c3ff" },
  { item: 9705, name: "Apparition 13", r: 60, ring: "#ff4fb8" },
  { item: 9713, name: "Apparition 11", r: 71, ring: "#10c99b" },
  { item: 9703, name: "Apparition 14", r: 83, ring: "#3d5afe" },
  { item: 9844, name: "Apparition 24", r: 96, ring: "#eeeaff" },
  { item: 9854, name: "Apparition 19", r: 110, ring: "#ffb000" },
];
/** What a merge into tier k scores. */
const POINTS = [0, 3, 6, 10, 15, 21, 28, 36, 45, 55, 66];
const TOP_BONUS = 120;
/** The first five drop, the small ones more often. */
const DROP_W = [0.3, 0.27, 0.2, 0.14, 0.09];
const SEEN_KEY = "zp-merge-seen";

interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  a: number;
  born: number;
  pop: number;
  dead?: boolean;
  /** Touched something since it was dropped (its first landing makes a sound). */
  landed?: boolean;
}
interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  s: number;
  c: string;
  life: number;
}
interface Float {
  x: number;
  y: number;
  s: string;
  c: string;
  life: number;
}

/** Each tier's art as 26 × 26 cells, its black ground keyed out (scene/snarkbody.ts), once loaded. */
const cells: (Int32Array | null)[] = TIERS.map(() => null);
let loading: Promise<void> | null = null;
function loadArt() {
  loading ??= Promise.all(TIERS.map((t, i) => snarkCells(t.item).then((c) => void (cells[i] = c), () => {}))).then(() => {});
  return loading;
}
const shadeOf = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};

const easeBack = (t: number) => {
  const c = 1.9;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

class Merge {
  private wrap: HTMLElement;
  private cv: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private nextCv: HTMLCanvasElement;
  private ladder: HTMLElement;
  private bodies: Body[] = [];
  private bits: Bit[] = [];
  private floats: Float[] = [];
  private rnd: () => number;
  private aim = W / 2;
  private cur = 0;
  private next = 0;
  /** Seconds until the next one may drop. */
  private wait = 0;
  private score = 0;
  private time = 0;
  private acc = 0;
  private danger = 0;
  private shake = 0;
  private over = false;
  private paused = false;
  private raf = 0;
  private last = 0;
  private k = 1;
  private dpr = 1;
  private keys = new Set<string>();
  private top = 0;
  private seen: number;
  private sprites = new Map<string, HTMLCanvasElement>();
  private ro: ResizeObserver;

  constructor(private host: ArcadeHost) {
    void loadArt().then(() => {
      this.sprites.clear();
      this.renderLadder();
    });
    this.rnd = rng(host.seed);
    this.seen = Math.max(4, Number(localStorage.getItem(SEEN_KEY) ?? 4) || 4);
    this.cur = this.draw5();
    this.next = this.draw5();
    this.wrap = document.createElement("div");
    this.wrap.className = "mg-wrap";
    this.wrap.innerHTML = `
      <aside class="mg-side">
        <div class="mg-next"><small>${T("NEXT", "下一个")}</small><canvas></canvas></div>
        <div class="mg-ladder"><small>${T("THE LADDER", "合成顺序")}</small><div class="mg-steps"></div></div>
      </aside>
      <div class="mg-jar"><canvas class="mg-cv"></canvas></div>`;
    host.el.append(this.wrap);
    this.cv = this.wrap.querySelector(".mg-cv")!;
    this.g = this.cv.getContext("2d")!;
    this.nextCv = this.wrap.querySelector(".mg-next canvas")!;
    this.ladder = this.wrap.querySelector(".mg-steps")!;
    this.renderLadder();
    this.ro = new ResizeObserver(() => this.fit());
    this.ro.observe(this.wrap);
    this.fit();
    // aiming and dropping: a mouse or a finger over the jar, or the keys
    this.cv.addEventListener("pointermove", this.onMove);
    this.cv.addEventListener("pointerdown", this.onDown);
    this.cv.addEventListener("pointerup", this.onUp);
    window.addEventListener("keydown", this.onKey, true);
    window.addEventListener("keyup", this.onKeyUp, true);
    host.status(T("Aim, then drop · two alike merge", "瞄准后投下 · 两个相同的会合成"));
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  private draw5() {
    let x = this.rnd();
    for (let i = 0; i < DROP_W.length; i++) {
      if ((x -= DROP_W[i]) <= 0) return i;
    }
    return 0;
  }

  private fit() {
    const box = this.wrap.querySelector<HTMLElement>(".mg-jar")!;
    const bw = box.clientWidth,
      bh = box.clientHeight;
    if (!bw || !bh) return;
    this.k = Math.min(bw / W, bh / H);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cv.style.width = `${Math.round(W * this.k)}px`;
    this.cv.style.height = `${Math.round(H * this.k)}px`;
    this.cv.width = Math.round(W * this.k * this.dpr);
    this.cv.height = Math.round(H * this.k * this.dpr);
    this.sprites.clear();
    const n = 76 * Math.min(2, window.devicePixelRatio || 1);
    this.nextCv.width = this.nextCv.height = n;
  }

  // ---- input -------------------------------------------------------------------------------

  private toField(e: PointerEvent) {
    const r = this.cv.getBoundingClientRect();
    return ((e.clientX - r.left) / r.width) * W;
  }
  private onMove = (e: PointerEvent) => {
    this.aim = this.toField(e);
  };
  private down = false;
  private onDown = (e: PointerEvent) => {
    this.down = true;
    this.aim = this.toField(e);
    this.cv.setPointerCapture?.(e.pointerId);
  };
  private onUp = (e: PointerEvent) => {
    if (!this.down) return;
    this.down = false;
    this.aim = this.toField(e);
    this.drop();
  };
  private onKey = (e: KeyboardEvent) => {
    if (this.over || e.target instanceof HTMLInputElement) return;
    const c = e.code;
    if (c === "ArrowLeft" || c === "KeyA" || c === "KeyQ" || c === "ArrowRight" || c === "KeyD") {
      this.keys.add(c);
      e.preventDefault();
    } else if (c === "Space" || c === "Enter" || c === "ArrowDown" || c === "KeyS") {
      e.preventDefault();
      if (!e.repeat) this.drop();
    }
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private drop() {
    if (this.over || this.paused || this.wait > 0) return;
    const r = TIERS[this.cur].r;
    const x = Math.max(r + 2, Math.min(W - r - 2, this.aim));
    this.bodies.push({ x, y: HANG, vx: 0, vy: 60, t: this.cur, a: 0, born: this.time, pop: 1 });
    this.cur = this.next;
    this.next = this.draw5();
    this.wait = 0.45;
    sfx.step(this.cur);
  }

  // ---- the physics -----------------------------------------------------------------------------

  private step(dt: number) {
    const B = this.bodies;
    for (const b of B) {
      b.vy += G * dt;
      b.vx *= 0.9995;
      b.vy *= 0.9995;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.a += (b.vx * dt) / TIERS[b.t].r;
      if (b.pop < 1) b.pop = Math.min(1, b.pop + dt / 0.2);
    }
    const merges: [Body, Body][] = [];
    for (let it = 0; it < 3; it++) {
      for (const b of B) {
        const r = TIERS[b.t].r;
        if (b.x < r) ((b.x = r), (b.vx = Math.abs(b.vx) * 0.2));
        else if (b.x > W - r) ((b.x = W - r), (b.vx = -Math.abs(b.vx) * 0.2));
        if (b.y > H - r) {
          b.y = H - r;
          if (b.vy > 0) {
            if (!b.landed && b.vy > 200) ((b.landed = true), sfx.step(b.t));
            b.vy = -b.vy * 0.12;
          }
          b.vx *= 0.985;
          b.landed = true;
        }
      }
      for (let i = 0; i < B.length; i++) {
        const a = B[i];
        if (a.dead) continue;
        const ra = TIERS[a.t].r;
        for (let j = i + 1; j < B.length; j++) {
          const b = B[j];
          if (b.dead) continue;
          const rb = TIERS[b.t].r;
          let dx = b.x - a.x,
            dy = b.y - a.y;
          const rr = ra + rb;
          if (Math.abs(dx) > rr || Math.abs(dy) > rr) continue;
          let d = Math.hypot(dx, dy);
          if (d >= rr) continue;
          if (a.t === b.t) {
            a.dead = b.dead = true;
            merges.push([a, b]);
            break;
          }
          if (d < 1e-4) ((dx = 0.01), (dy = 1), (d = 1));
          const nx = dx / d,
            ny = dy / d;
          const ma = ra * ra,
            mb = rb * rb;
          const over = rr - d;
          const ka = mb / (ma + mb),
            kb = ma / (ma + mb);
          a.x -= nx * over * ka;
          a.y -= ny * over * ka;
          b.x += nx * over * kb;
          b.y += ny * over * kb;
          const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (rv < 0) {
            const jimp = (-(1 + 0.08) * rv) / (1 / ma + 1 / mb);
            a.vx -= (jimp / ma) * nx;
            a.vy -= (jimp / ma) * ny;
            b.vx += (jimp / mb) * nx;
            b.vy += (jimp / mb) * ny;
            // a touch of friction along the contact
            const tx = -ny,
              ty = nx;
            const tv = (b.vx - a.vx) * tx + (b.vy - a.vy) * ty;
            const f = tv * 0.06;
            a.vx += f * tx * ka;
            a.vy += f * ty * ka;
            b.vx -= f * tx * kb;
            b.vy -= f * ty * kb;
            if (!a.landed && rv < -200) ((a.landed = true), sfx.step(a.t));
            if (!b.landed && rv < -200) ((b.landed = true), sfx.step(b.t));
            a.landed = b.landed = true;
          }
        }
      }
    }
    if (merges.length) {
      for (const [a, b] of merges) this.merge(a, b);
      this.bodies = this.bodies.filter((b) => !b.dead);
    }
  }

  private merge(a: Body, b: Body) {
    const t = a.t + 1;
    const x = (a.x + b.x) / 2,
      y = (a.y + b.y) / 2;
    if (t >= TIERS.length) {
      // two of the last one: they burst and clear their room
      this.add(TOP_BONUS, x, y, TIERS[a.t].ring);
      this.burst(x, y, TIERS[a.t].ring, 70, 520);
      this.burst(x, y, "#ffffff", 30, 420);
      this.shake = 1.4;
      sfx.fanfare();
      return;
    }
    const r = TIERS[t].r;
    this.bodies.push({ x: Math.max(r, Math.min(W - r, x)), y: Math.min(H - r, y), vx: (a.vx + b.vx) * 0.25, vy: Math.min(0, (a.vy + b.vy) * 0.25) - 40, t, a: (a.a + b.a) / 2, born: this.time, pop: 0.35, landed: true });
    this.add(POINTS[t], x, y, TIERS[t].ring);
    this.burst(x, y, TIERS[t].ring, 10 + t * 3, 160 + t * 30);
    if (t >= 7) this.shake = Math.max(this.shake, 0.35 + (t - 7) * 0.2);
    sfx.blip(t * 1.3);
    if (t >= 5) sfx.coin();
    if (t > this.top) this.top = t;
    if (t >= this.seen) {
      this.seen = t + 1;
      try {
        localStorage.setItem(SEEN_KEY, String(this.seen));
      } catch {
        /* private mode */
      }
      this.renderLadder();
      sfx.star();
      this.floats.push({ x: W / 2, y: H * 0.42, s: T(`NEW: ${TIERS[t].name}`, `新解锁：${TIERS[t].name}`), c: TIERS[t].ring, life: 1.8 });
    }
  }

  private add(n: number, x: number, y: number, c: string) {
    this.score += n;
    this.host.score(this.score);
    this.floats.push({ x, y: y - 10, s: `+${n}`, c, life: 1 });
  }

  private burst(x: number, y: number, c: string, n: number, sp: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2,
        v = sp * (0.3 + Math.random() * 0.7);
      this.bits.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - sp * 0.3, s: 3 + Math.random() * 4, c, life: 0.6 + Math.random() * 0.5 });
    }
  }

  // ---- the frame -------------------------------------------------------------------------------

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (!this.paused && !this.over) {
      this.time += dt;
      this.wait = Math.max(0, this.wait - dt);
      const dir = (this.keys.has("ArrowRight") || this.keys.has("KeyD") ? 1 : 0) - (this.keys.has("ArrowLeft") || this.keys.has("KeyA") || this.keys.has("KeyQ") ? 1 : 0);
      if (dir) this.aim += dir * 360 * dt;
      const r = TIERS[this.cur].r;
      this.aim = Math.max(r + 2, Math.min(W - r - 2, this.aim));
      this.acc += dt;
      let n = 0;
      while (this.acc >= STEP && n++ < 20) {
        this.step(STEP);
        this.acc -= STEP;
      }
      this.watchLine(dt);
    }
    for (const p of this.bits) {
      p.vy += 900 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.bits = this.bits.filter((p) => p.life > 0);
    for (const f of this.floats) ((f.y -= 40 * dt), (f.life -= dt));
    this.floats = this.floats.filter((f) => f.life > 0);
    this.shake *= Math.exp(-6 * dt);
    this.paint();
  };

  /** Over the line, settled, for 2 s: the end. */
  private watchLine(dt: number) {
    let over = false;
    for (const b of this.bodies) if (this.time - b.born > 1 && b.y - TIERS[b.t].r < LINE && Math.abs(b.vy) < 120) over = true;
    this.danger = over ? this.danger + dt : Math.max(0, this.danger - dt * 2);
    if (this.danger > 2.2) this.end();
  }

  private end() {
    if (this.over) return;
    this.over = true;
    sfx.lose();
    const best = TIERS[this.top];
    this.host.over({ score: this.score, line: this.top > 0 ? T(`Biggest: ${best.name}`, `最大：${best.name}`) : undefined });
  }

  /**
   * A tier's ball at the jar's scale: a solid fill in its own loud colour (a fruit of its own: one
   * look per tier), the Apparition's pixels on it, a darker rim, a highlight.
   */
  private sprite(t: number, size: number) {
    const art = cells[t];
    const key = `${t}:${size}:${art ? 1 : 0}`;
    let c = this.sprites.get(key);
    if (c) return c;
    c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d")!;
    const R = size / 2;
    const col = TIERS[t].ring;
    const rim = Math.max(2, R * 0.1);
    g.save();
    g.beginPath();
    g.arc(R, R, R - rim * 0.5, 0, Math.PI * 2);
    g.clip();
    // the fill: the colour, lighter at the top
    const fill = g.createRadialGradient(R * 0.75, R * 0.6, R * 0.1, R, R, R);
    fill.addColorStop(0, shadeOf(col, 0.28));
    fill.addColorStop(0.65, col);
    fill.addColorStop(1, shadeOf(col, -0.3));
    g.fillStyle = fill;
    g.fillRect(0, 0, size, size);
    if (art) {
      // the Apparition, pixel for pixel, its bust filling the ball
      const cell = (R * 2 * 0.98) / 26;
      const ox = R - 13 * cell,
        oy = R - 12.4 * cell;
      for (let y = 0; y < 26; y++)
        for (let x = 0; x < 26; x++) {
          const v = art[y * 26 + x];
          if (v < 0) continue;
          g.fillStyle = `#${v.toString(16).padStart(6, "0")}`;
          g.fillRect(Math.floor(ox + x * cell), Math.floor(oy + y * cell), Math.ceil(cell), Math.ceil(cell));
        }
    } else {
      g.fillStyle = "rgba(0,0,0,0.35)";
      g.font = `700 ${Math.round(R)}px Geist, system-ui, sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("Z", R, R);
    }
    // a shade low, a gloss high: a ball
    const sh = g.createRadialGradient(R * 0.7, R * 0.5, R * 0.3, R, R, R);
    sh.addColorStop(0, "rgba(255,255,255,0.06)");
    sh.addColorStop(0.75, "rgba(0,0,0,0)");
    sh.addColorStop(1, "rgba(0,0,0,0.32)");
    g.fillStyle = sh;
    g.fillRect(0, 0, size, size);
    g.restore();
    g.lineWidth = rim;
    g.strokeStyle = shadeOf(col, -0.45);
    g.beginPath();
    g.arc(R, R, R - rim / 2, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = Math.max(1.5, rim * 0.55);
    g.strokeStyle = "rgba(255,255,255,0.7)";
    g.lineCap = "round";
    g.beginPath();
    g.arc(R, R, R - rim * 1.7, Math.PI * 1.1, Math.PI * 1.38);
    g.stroke();
    // the last one: a rainbow rim (the Mirage's colours)
    if (t === TIERS.length - 1) {
      const rb = g.createConicGradient(0, R, R);
      ["#ff3b5c", "#ffd60a", "#5fdc2e", "#22c3ff", "#9b5cff", "#ff4fb8", "#ff3b5c"].forEach((h, i, a) => rb.addColorStop(i / (a.length - 1), h));
      g.lineWidth = rim * 0.8;
      g.strokeStyle = rb;
      g.beginPath();
      g.arc(R, R, R - rim * 0.45, 0, Math.PI * 2);
      g.stroke();
    }
    this.sprites.set(key, c);
    return c;
  }

  private drawBody(g: CanvasRenderingContext2D, t: number, x: number, y: number, a: number, s = 1, alpha = 1) {
    const r = TIERS[t].r * s;
    const px = Math.max(8, Math.round(TIERS[t].r * 2 * this.k * this.dpr));
    const sp = this.sprite(t, px);
    g.save();
    g.globalAlpha = alpha;
    g.translate(x, y);
    g.rotate(a);
    g.drawImage(sp, -r, -r, r * 2, r * 2);
    g.restore();
  }

  private paint() {
    const g = this.g;
    const k = this.k * this.dpr;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.cv.width, this.cv.height);
    const sx = (Math.random() - 0.5) * this.shake * 10,
      sy = (Math.random() - 0.5) * this.shake * 10;
    g.setTransform(k, 0, 0, k, sx * k, sy * k);
    // the jar: a dark well, a pixel grid, its floor
    g.fillStyle = "#100d1a";
    g.fillRect(0, 0, W, H);
    g.fillStyle = "rgba(255,255,255,0.035)";
    for (let y = 0; y < H; y += 20) g.fillRect(0, y, W, 1);
    for (let x = 0; x < W; x += 20) g.fillRect(x, 0, 1, H);
    // the line
    const warn = this.danger > 0 || this.bodies.some((b) => this.time - b.born > 1 && b.y - TIERS[b.t].r < LINE + 40);
    const blink = this.danger > 0 ? 0.5 + 0.5 * Math.sin(this.time * 18) : 1;
    g.fillStyle = warn ? `rgba(255,79,79,${0.55 + 0.45 * blink})` : "rgba(255,255,255,0.18)";
    for (let x = 0; x < W; x += 16) g.fillRect(x, LINE - 1, 9, 2);
    // the guide down from the one hanging
    if (!this.over && this.wait <= 0) {
      const r = TIERS[this.cur].r;
      g.fillStyle = "rgba(255,255,255,0.14)";
      for (let y = HANG + r + 6; y < H; y += 12) g.fillRect(this.aim - 1, y, 2, 6);
      this.drawBody(g, this.cur, this.aim, HANG, 0);
    }
    for (const b of this.bodies) this.drawBody(g, b.t, b.x, b.y, b.a, b.pop < 1 ? Math.max(0.2, easeBack(b.pop)) : 1);
    for (const p of this.bits) {
      g.globalAlpha = Math.min(1, p.life * 2);
      g.fillStyle = p.c;
      g.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
    }
    g.globalAlpha = 1;
    g.textAlign = "center";
    g.textBaseline = "middle";
    for (const f of this.floats) {
      g.globalAlpha = Math.min(1, f.life * 2);
      g.font = `400 ${f.s.length > 6 ? 20 : 24}px DotGothic16, monospace`;
      g.lineWidth = 5;
      g.strokeStyle = "#07060c";
      g.strokeText(f.s, f.x, f.y);
      g.fillStyle = f.c;
      g.fillText(f.s, f.x, f.y);
    }
    g.globalAlpha = 1;
    // the walls: stepped pixel edges
    g.fillStyle = "#2a2540";
    g.fillRect(0, H - 4, W, 4);
    // the next one
    const n = this.nextCv;
    const ng = n.getContext("2d")!;
    ng.clearRect(0, 0, n.width, n.height);
    const sp = this.sprite(this.next, n.width);
    ng.drawImage(sp, 0, 0, n.width, n.height);
  }

  /** The ladder beside the jar: what merges into what, the ones not made yet as shadows. */
  private renderLadder() {
    const px = 2 * 40;
    this.ladder.innerHTML = TIERS.map((t, i) => `<span class="mg-step${i < this.seen ? "" : " dim"}" style="--r:${t.ring};--s:${(0.5 + (i / (TIERS.length - 1)) * 0.5).toFixed(2)}" title="${i < this.seen ? t.name : "?"}">${i < this.seen ? `<canvas width="${px}" height="${px}"></canvas>` : "<i>?</i>"}</span>`).join("");
    this.ladder.querySelectorAll<HTMLCanvasElement>("canvas").forEach((cv, i) => cv.getContext("2d")!.drawImage(this.sprite(i, px), 0, 0));
  }

  pause(on: boolean) {
    this.paused = on;
    this.last = performance.now();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    window.removeEventListener("keydown", this.onKey, true);
    window.removeEventListener("keyup", this.onKeyUp, true);
    this.wrap.remove();
  }
}

const make: ArcadeMake = (host: ArcadeHost) => new Merge(host);
export default make;
