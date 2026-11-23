/**
 * LAVE MONTANTE (chacun pour soi, 60 s max): a race up the shaft of a volcano, seen from the side.
 * Rock ledges (some sliding, some crumbling) lead to the crater's rim while the lava rises, faster
 * and faster. Stick ← → to run, A to jump (hold it to jump higher). Touch the lava = out.
 * The first one out of the crater wins; otherwise the highest when time is up.
 */
import * as THREE from "three";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef } from "../types";
import { GEO, VIEWPORT, canvasTex, cone, cyl, group, textSprite, toon, toScreen } from "../../engine/gfx";
import { clamp, damp } from "../../engine/util";
import { music } from "../../engine/audio";
import { T } from "../../../../i18n/lang";

const TIME = 60;
const HALF_W = 9.6; // the shaft's inner half-width
const TOP_Y = 86;
const SPEED = 6.6;
const JUMP_V = 12.6;
const GRAV = 30;
const FALL_GRAV = 38;
const CUT_GRAV = 66;
const MAX_FALL = 20;
const COYOTE = 0.1;
const BUFFER = 0.13;
const PR = 0.34;
const PH = 0.5; // platform thickness

type Kind = "rock" | "move" | "crumble" | "top";
interface Plat {
  mesh: THREE.Object3D;
  x0: number;
  x: number;
  y: number;
  w: number;
  kind: Kind;
  amp: number;
  freq: number;
  ph: number;
  dx: number;
  /** Crumbling: seconds since first stepped on (-1: untouched); fallen = gone. */
  crumbleT: number;
  fallen: boolean;
  vy: number;
}

interface Climber {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ground: Plat | null;
  coyote: number;
  buffer: number;
  out: boolean;
  outT: number;
  burnT: number;
  done: boolean;
  doneT: number;
  best: number;
}

interface Brain {
  target: Plat | null;
  aim: number;
  wait: number;
  lastA: boolean;
  on: Plat | null;
  onT: number;
}

class LaveMontante extends BaseMini {
  private plats: Plat[] = [];
  private cs: Climber[] = [];
  private brains: Brain[] = [];
  private lavaY = -3;
  private lava!: THREE.Mesh;
  private lavaTex!: THREE.Texture;
  private glow!: THREE.Mesh;
  private light!: THREE.PointLight;
  private focus = 3;
  private endT = -1;
  private hurried = false;
  private faster = false;
  private emberT = 0;
  private marks: HTMLElement[] = [];
  private ownTex: THREE.Texture[] = [];
  private moveMats: THREE.Material[] = [];
  private flag!: THREE.Group;
  /** Height of the crater's rim (the finish). */
  private top = TOP_Y;

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#1a0f3a", "#ff7a3d"], size: 14, sun: [0.2, 0.6, 1], sunColor: "#ffd2a8", sunIntensity: 1.6, hemi: ["#ffb08a", "#40141a", 1.2], fog: { color: "#3a1418", near: 22, far: 70 } });
    this.buildShaft();
    this.buildPlatforms();
    const xs = [-4.5, -1.5, 1.5, 4.5];
    this.players.forEach((p, i) => {
      const a = this.spawn(i, xs[i], 0, 0);
      a.setRing(p.char.color);
      this.cs.push({ x: xs[i], y: 0, vx: 0, vy: 0, ground: this.plats[0], coyote: 0, buffer: 0, out: false, outT: 0, burnT: 0, done: false, doneT: 0, best: 0 });
      this.brains.push({ target: null, aim: 0, wait: 0, lastA: false, on: null, onT: 0 });
      this.marks.push(
        this.hud.add(
          `<div style="position:absolute;left:0;top:0;display:none;transform:translate(-50%,0);padding:calc(var(--u)*0.3) calc(var(--u)*0.9);border-radius:999px;background:${p.char.color};color:#fff;font-family:var(--title);font-size:calc(var(--u)*1.6);border:calc(var(--u)*0.25) solid #fff;white-space:nowrap"></div>`,
        ).firstElementChild as HTMLElement,
      );
    });
    this.hud.players(this.players, () => "0 m");
    this.hud.timer(TIME);
    this.setCam([0, 12, 30], [0, 5, 0], 45);
  }

  // ------------------------------------------------------------ the volcano

  private buildShaft() {
    const s = this.scene;
    // the back wall: dark basalt veined with glowing cracks
    const back = canvasTex(
      512,
      512,
      (g, w) => {
        g.fillStyle = "#2a1a22";
        g.fillRect(0, 0, w, w);
        for (let i = 0; i < 70; i++) {
          g.fillStyle = i % 3 ? "#352330" : "#22141c";
          const x = (i * 157) % w,
            y = (i * 89) % w;
          g.beginPath();
          g.ellipse(x, y, 30 + (i % 5) * 10, 18 + (i % 4) * 8, i, 0, Math.PI * 2);
          g.fill();
        }
        g.strokeStyle = "#ff7a2a";
        g.lineCap = "round";
        for (let i = 0; i < 9; i++) {
          let x = (i * 211) % w,
            y = (i * 131) % w;
          g.lineWidth = 5;
          g.beginPath();
          g.moveTo(x, y);
          for (let k = 0; k < 6; k++) {
            x += ((i * 7 + k * 13) % 40) - 20;
            y += 22;
            g.lineTo(x, y);
          }
          g.stroke();
        }
      },
      true,
    );
    back.repeat.set(2, 8);
    this.ownTex.push(back);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 132), new THREE.MeshToonMaterial({ map: back, emissive: "#ff5a1e", emissiveIntensity: 0.06 }));
    wall.position.set(0, TOP_Y + 4 - 66, -2.6);
    s.add(wall);
    // side walls with jutting rocks
    const side = canvasTex(
      256,
      256,
      (g, w) => {
        g.fillStyle = "#4a2e2e";
        g.fillRect(0, 0, w, w);
        for (let i = 0; i < 30; i++) {
          g.fillStyle = i % 2 ? "#5a3838" : "#3a2226";
          g.fillRect((i * 67) % w, (i * 41) % w, 50, 26);
        }
      },
      true,
    );
    side.repeat.set(1, 12);
    this.ownTex.push(side);
    const sideMat = new THREE.MeshToonMaterial({ map: side });
    for (const sx of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(6, 132, 8), sideMat);
      m.position.set(sx * (HALF_W + 3.3), TOP_Y + 4 - 66, 0);
      m.receiveShadow = true;
      s.add(m);
    }
    const rocks = new THREE.InstancedMesh(GEO.dodeca, toon("#5a3434"), 70);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (let k = 0; k < 70; k++) {
      const sx = k % 2 ? 1 : -1;
      const y = -6 + (k / 70) * (TOP_Y + 6) + this.rnd() * 2;
      const r = 0.6 + this.rnd() * 0.9;
      e.set(this.rnd() * 3, this.rnd() * 3, this.rnd() * 3);
      q.setFromEuler(e);
      m4.compose(new THREE.Vector3(sx * (HALF_W + 0.3 + this.rnd() * 0.3), y, -1 + this.rnd() * 2.5), q, new THREE.Vector3(r, r * 0.8, r));
      rocks.setMatrixAt(k, m4);
    }
    s.add(rocks);
    // the crater rim at the top, and the sky above it
    for (const sx of [-1, 1]) {
      cone(s, "#5a3434", 9, 8, { x: sx * (HALF_W + 7), y: TOP_Y + 6, z: -1, lo: true });
    }
    // lava: a glowing block that rises, with a heat glow and a light
    this.lavaTex = canvasTex(
      256,
      256,
      (g, w) => {
        g.fillStyle = "#ff5a14";
        g.fillRect(0, 0, w, w);
        for (let i = 0; i < 26; i++) {
          g.fillStyle = i % 3 ? "#ffb02e" : "#ffe14a";
          g.beginPath();
          g.ellipse((i * 97) % w, (i * 61) % w, 22 + (i % 4) * 8, 10 + (i % 3) * 5, i, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = "rgba(160,30,10,0.55)";
        for (let i = 0; i < 12; i++) {
          g.beginPath();
          g.ellipse((i * 173) % w, (i * 37) % w, 26, 9, i * 2, 0, Math.PI * 2);
          g.fill();
        }
      },
      true,
    );
    this.lavaTex.repeat.set(3, 6);
    this.ownTex.push(this.lavaTex);
    this.lava = new THREE.Mesh(new THREE.BoxGeometry(HALF_W * 2 + 2, 60, 7), new THREE.MeshBasicMaterial({ map: this.lavaTex, fog: false }));
    s.add(this.lava);
    const glowTex = canvasTex(16, 128, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, "rgba(255,140,40,0)");
      gr.addColorStop(1, "rgba(255,140,40,0.75)");
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    });
    this.ownTex.push(glowTex);
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2 + 2, 5), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.glow.position.z = 3.6;
    s.add(this.glow);
    this.light = new THREE.PointLight("#ff7a2a", 60, 22, 1.4);
    s.add(this.light);
  }

  private buildPlatforms() {
    const s = this.scene;
    const rockTop = toon("#9a7070");
    const rsTex = canvasTex(128, 32, (g, w, h) => {
      g.fillStyle = "#4a3036";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#3a242a";
      for (let i = 0; i < 6; i++) g.fillRect(i * 23, 10 + (i % 3) * 6, 14, 6);
      g.fillStyle = "#ff8a3a";
      g.fillRect(0, 0, w, 5);
    });
    this.ownTex.push(rsTex);
    const rockSide = new THREE.MeshToonMaterial({ map: rsTex, emissive: "#ff5a1e", emissiveIntensity: 0.12 });
    this.moveMats.push(rockSide);
    const crTex = canvasTex(256, 64, (g, w, h) => {
      g.fillStyle = "#d29a5a";
      g.fillRect(0, 0, w, h);
      g.strokeStyle = "#5a3020";
      g.lineWidth = 4;
      for (let i = 0; i < 7; i++) {
        let x = 20 + i * 34,
          y = 0;
        g.beginPath();
        g.moveTo(x, y);
        while (y < h) {
          x += ((i * 13 + y) % 20) - 10;
          y += 14;
          g.lineTo(x, y);
        }
        g.stroke();
      }
    });
    const mvTex = canvasTex(256, 64, (g, w, h) => {
      g.fillStyle = "#3a4458";
      g.fillRect(0, 0, w, h);
      for (let i = -2; i < 12; i++) {
        g.fillStyle = i % 2 ? "#ffd23f" : "#1d1630";
        g.beginPath();
        g.moveTo(i * 24, h);
        g.lineTo(i * 24 + 24, h);
        g.lineTo(i * 24 + 48, 0);
        g.lineTo(i * 24 + 24, 0);
        g.closePath();
        g.fill();
      }
    });
    this.ownTex.push(crTex, mvTex);
    const crMat = new THREE.MeshToonMaterial({ map: crTex });
    const mvMat = new THREE.MeshToonMaterial({ map: mvTex });
    const mvTop = toon("#8a94a8");
    this.moveMats.push(crMat, mvMat);
    const make = (x: number, y: number, w: number, kind: Kind) => {
      let mats: THREE.Material[];
      if (kind === "crumble") mats = [crMat, crMat, toon("#e8b070"), crMat, crMat, crMat];
      else if (kind === "move") mats = [mvMat, mvMat, mvTop, mvMat, mvMat, mvMat];
      else mats = [rockSide, rockSide, rockTop, rockSide, rockSide, rockSide];
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, PH, 2.2), mats);
      m.position.set(x, y - PH / 2, 0);
      m.castShadow = m.receiveShadow = true;
      s.add(m);
      const p: Plat = { mesh: m, x0: x, x, y, w, kind, amp: 0, freq: 0, ph: 0, dx: 0, crumbleT: -1, fallen: false, vy: 0 };
      this.plats.push(p);
      return p;
    };
    // the floor
    make(0, 0, HALF_W * 2, "rock");
    type Slot = { x: number; w: number; kind: Kind };
    const gap = (a: { x: number; w: number }, b: { x: number; w: number }) => Math.max(0, Math.abs(a.x - b.x) - a.w / 2 - b.w / 2);
    // the solid ledges of the row below (crumbling ones don't count: they may be gone)
    let prev: { x: number; w: number }[] = [{ x: 0, w: HALF_W * 2 }];
    let y = 2.3;
    let row = 0;
    let lastY = 0;
    while (y < TOP_Y - 2.3) {
      lastY = y;
      row++;
      const n = this.rnd() < 0.45 ? 3 : 2;
      const span = (HALF_W * 2 - 0.6) / n;
      const slots: Slot[] = [];
      for (let k = 0; k < n; k++) {
        const w = 2.5 + this.rnd() * 1.6;
        const l = -HALF_W + 0.3 + k * span;
        const x = l + w / 2 + this.rnd() * Math.max(0, span - w);
        let kind: Kind = "rock";
        if (row > 2) {
          const q = this.rnd();
          if (q < 0.26) kind = "crumble";
          else if (q < 0.5 && row > 3) kind = "move";
        }
        slots.push({ x, w, kind });
      }
      // every solid ledge below must lead to a solid ledge here (a sliding one counts, at its worst)
      for (const P of prev) {
        let best: Slot | null = null,
          bg = Infinity;
        for (const sl of slots) {
          const g = gap(sl, P) + (sl.kind === "move" ? 1.4 : 0);
          if (g < bg) {
            bg = g;
            best = sl;
          }
        }
        if (best && bg < 2.3) {
          if (best.kind === "crumble") best.kind = "rock";
        } else {
          const w = 2.6;
          slots.push({ x: clamp(P.x + (this.rnd() - 0.5) * Math.max(0, P.w - w), -HALF_W + w / 2, HALF_W - w / 2), w, kind: "rock" });
        }
      }
      const made: Plat[] = [];
      for (const sl of slots) {
        const p = make(sl.x, y, sl.w, sl.kind);
        if (sl.kind === "move") {
          const room = Math.min(sl.x - sl.w / 2 + HALF_W, HALF_W - sl.x - sl.w / 2, span * 0.5);
          p.amp = clamp(room, 0.8, 2.4);
          p.freq = 0.7 + this.rnd() * 0.6;
          p.ph = this.rnd() * Math.PI * 2;
        }
        made.push(p);
      }
      prev = slots.filter((sl) => sl.kind !== "crumble");
      y += 1.95 + this.rnd() * 0.4;
    }
    // the crater's rim: the way out, one jump above the last row
    this.top = lastY + 2.25;
    make(0, this.top, HALF_W * 2, "top");
    const f = group(s, { x: 0, y: this.top, z: -0.4 });
    cyl(f, "#e8e0d0", 0.08, 4, { y: 2 });
    const chk = canvasTex(128, 80, (g) => {
      for (let i = 0; i < 8; i++) for (let j = 0; j < 5; j++) {
        g.fillStyle = (i + j) % 2 ? "#1d1630" : "#ffffff";
        g.fillRect(i * 16, j * 16, 16, 16);
      }
    });
    this.ownTex.push(chk);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.25), new THREE.MeshToonMaterial({ map: chk, side: THREE.DoubleSide }));
    flag.position.set(1.02, 3.3, 0);
    f.add(flag);
    this.flag = f;
    const sign = textSprite(T("EXIT!", "出口！"), 1.1, { color: "#1d1630", bg: "#ffd23f" });
    sign.position.set(-3.5, this.top + 1.6, 0.5);
    s.add(sign);
  }

  // ------------------------------------------------------------ helpers

  private standOn(c: Climber, p: Plat) {
    return !p.fallen && Math.abs(c.x - p.x) <= p.w / 2 + 0.18;
  }

  // ------------------------------------------------------------ CPUs

  protected cpu(i: number, dt: number): CpuPad {
    const b = this.brains[i];
    const o = this.think(i, dt);
    // a new jump needs A released first (holding it only works once)
    const me = this.cs[i];
    if (o.a && me.ground && b.lastA) o.a = false;
    b.lastA = !!o.a;
    return o;
  }

  private think(i: number, dt: number): CpuPad {
    const me = this.cs[i];
    if (me.out || me.done) return {};
    const lv = this.players[i].level;
    const b = this.brains[i];
    const g = me.ground;
    // progress: time since we last stood higher (or since we fell)
    b.onT += dt;
    let fell = false;
    if (g && b.on !== g) {
      if (g.y > (b.on?.y ?? -9) + 0.5) b.onT = 0;
      else if (g.y < (b.on?.y ?? 0) - 0.5) {
        b.onT = 0;
        fell = true;
      }
      b.on = g;
    }
    if (g) {
      // no progress for a while: try another way up
      const stuck = b.onT > 2.4;
      if (stuck) b.onT = 0;
      const tooHigh = !!b.target && b.target.y - g.y > 2.5;
      if (stuck || fell || tooHigh || !b.target || b.target.fallen || b.target.y <= g.y + 0.3 || b.target === g) {
        const old = b.target;
        b.target = null;
        let best = -Infinity;
        for (const p of this.plats) {
          if (p.fallen || p.y <= g.y + 0.7 || p.y > g.y + 2.5) continue;
          const edge = Math.max(0, Math.abs(me.x - p.x) - p.w / 2 + 0.5);
          if (edge > 6) continue;
          let s = -edge * 0.8;
          if (p.kind === "crumble") s -= (p.crumbleT >= 0 ? 5 : 2) * lv;
          if (p.kind === "move") s -= 0.6 * lv;
          s += (p.y - me.y) * 0.4;
          if (stuck && p === old) s -= 3;
          s += (Math.random() - 0.5) * (1 - lv) * 3;
          if (s > best) {
            best = s;
            b.target = p;
          }
        }
        b.aim = (Math.random() - 0.5) * (1 - lv) * 3.2;
        b.wait = 0.12 + (1 - lv) * 0.85 + Math.random() * 0.3;
        this.cpuReset(i, "jmp");
      }
      const t = b.target;
      if (!t) {
        // nothing in reach: wait on the middle of our ledge for a sliding one to come by
        return { x: clamp((g.x - me.x) * 0.8, -1, 1) };
      }
      // the spot under the target nearest to us, kept on our ledge
      const want = clamp(me.x, t.x - t.w / 2 + 0.55, t.x + t.w / 2 - 0.55);
      const onMine = want >= g.x - g.w / 2 + 0.25 && want <= g.x + g.w / 2 - 0.25;
      if (onMine) {
        const dx = want - me.x;
        if (Math.abs(dx) > 0.35) return { x: clamp(dx * 1.5, -1, 1) };
        if (this.cpuAfter(i, "jmp", b.wait)) return { a: true, x: clamp((t.x - me.x) * 0.3, -1, 1) };
        return {};
      }
      // run to our ledge's edge, then leap across
      const dir = Math.sign(want - me.x) || 1;
      const edgeX = g.x + dir * (g.w / 2 - 0.2);
      const gapToTarget = Math.abs(want - me.x);
      // the reaction time runs while we head for the edge
      const ready = this.cpuAfter(i, "jmp", b.wait * 0.6);
      const nearEdge = Math.abs(edgeX - me.x) < 0.6;
      if (nearEdge || gapToTarget < 2.6) {
        if (ready) return { x: dir, a: true };
        // not ready yet: don't run off the ledge
        if (Math.abs(edgeX - me.x) < 0.9) return { x: clamp((edgeX - dir * 0.5 - me.x) * 2, -1, 1) };
      }
      return { x: dir };
    }
    // in the air: steer onto the target, hold A to go high
    const t = b.target;
    if (!t) return { a: me.vy > 0 };
    const tx = clamp(me.x, t.x - t.w / 2 + 0.6, t.x + t.w / 2 - 0.6) + b.aim;
    const above = me.y > t.y + 0.1;
    const dx = tx - me.x;
    return { x: above || me.vy > 4 ? clamp(dx * 1.6, -1, 1) : clamp(dx * 0.9, -1, 1), a: me.vy > 0 };
  }

  // ------------------------------------------------------------ the game

  protected idle(dt: number) {
    this.animWorld(dt);
    this.updatePlats(dt, false);
    this.focus = 5;
    this.moveCam([0, this.focus + 1.5, 21], [0, this.focus, 0], dt, 1.4);
  }

  protected step(dt: number) {
    const left = TIME - this.t;
    this.hud.timer(left);
    // the lava: slow at first, then faster and faster
    this.lavaY = -4 + 0.5 * this.t + 0.024 * this.t * this.t;
    if (!this.faster && this.t > 30) {
      this.faster = true;
      this.hud.banner(T("The lava speeds up!", "熔岩加速了！"), { color: "#ff7a2a", ms: 1100 });
      this.sound("rumble");
      this.shake = 0.3;
    }
    if (!this.hurried && left <= 10) {
      this.hurried = true;
      this.hud.banner(T("10 seconds left!", "还剩 10 秒！"), { color: "#ffd23f", ms: 1000 });
      music.speed(1.15);
    }
    this.animWorld(dt);
    this.updatePlats(dt, true);

    // ---- climbers
    this.cs.forEach((c, i) => this.stepClimber(c, i, dt));
    // bumps (side by side)
    for (let i = 0; i < this.cs.length; i++)
      for (let j = i + 1; j < this.cs.length; j++) {
        const A = this.cs[i],
          B = this.cs[j];
        if (A.out || B.out || A.done || B.done) continue;
        if (Math.abs(A.y - B.y) > 1.1) continue;
        const d = B.x - A.x;
        if (Math.abs(d) < PR * 2) {
          const push = (PR * 2 - Math.abs(d)) / 2;
          const s = Math.sign(d) || 1;
          A.x -= s * push;
          B.x += s * push;
        }
      }

    // ---- camera: follow the pack, never let the lava leave the bottom of the screen
    const live = this.cs.filter((c) => !c.out);
    if (live.length) {
      const ys = live.map((c) => c.y);
      const hi = Math.max(...ys),
        lo = Math.min(...ys);
      const want = Math.max(this.lavaY + 6.2, Math.min((hi + lo) / 2 + 1.5, hi - 3));
      this.focus = damp(this.focus, Math.min(want, this.top - 3), 3, dt);
    }
    this.moveCam([0, this.focus + 1.5, 21], [0, this.focus, 0], dt, 5);
    this.updateMarks();

    // ---- the end
    const anyDone = this.cs.some((c) => c.done);
    const alive = this.cs.filter((c) => !c.out && !c.done).length;
    if ((anyDone || alive === 0 || (alive === 1 && this.cs.filter((c) => c.out).length === this.cs.length - 1) || left <= 0) && this.endT < 0) this.endT = this.t;
    if (this.endT >= 0 && (this.t - this.endT > 1.1 || left <= 0)) this.endGame();
  }

  private stepClimber(c: Climber, i: number, dt: number) {
    const a = this.avatars[i];
    if (c.out) {
      // burnt: rocket up with smoke, then sink
      c.burnT += dt;
      c.vy -= 24 * dt;
      c.y += c.vy * dt;
      a.model.rotation.z += dt * 8;
      a.pos.set(c.x, c.y, 0.3);
      if (c.burnT < 1.2 && Math.random() < 0.6) this.fx.burst({ x: c.x, y: c.y + 0.6, z: 0.3 }, { count: 1, colors: ["#5a5466", "#8a8494"], speed: 0.6, up: 1.5, gravity: -2, size: 0.3, sizeEnd: 0.05, life: 0.8, shape: "ball" });
      if (c.y < this.lavaY - 1.5) a.setVisible(false);
      return;
    }
    if (c.done) {
      a.anim = "win";
      a.face(0, 0.016, 6);
      return;
    }
    const p = this.pad(i);
    // run
    const k = 1 - Math.exp(-(c.ground ? 16 : 8) * dt);
    c.vx += (p.x * SPEED - c.vx) * k;
    // jump: buffer + coyote time
    if (p.aDown) c.buffer = BUFFER;
    else c.buffer -= dt;
    if (c.ground) c.coyote = COYOTE;
    else c.coyote -= dt;
    if (c.buffer > 0 && c.coyote > 0) {
      c.vy = JUMP_V;
      c.ground = null;
      c.coyote = 0;
      c.buffer = 0;
      this.sound("jump");
      this.fx.dust({ x: c.x, y: c.y, z: 0 }, 4, "#a08080");
    }
    // exact parabola whatever the frame rate (a jump always reaches the same height)
    let avgVy = 0;
    if (!c.ground) {
      const g = c.vy > 0 ? (p.a ? GRAV : CUT_GRAV) : FALL_GRAV;
      const v0 = c.vy;
      c.vy = Math.max(-MAX_FALL, c.vy - g * dt);
      avgVy = (v0 + c.vy) / 2;
    }
    const prevY = c.y;
    c.x += c.vx * dt;
    if (c.ground) {
      c.x += c.ground.dx;
      c.y = c.ground.y;
      if (!this.standOn(c, c.ground)) c.ground = null;
    } else c.y += avgVy * dt;
    c.x = clamp(c.x, -HALF_W + PR, HALF_W - PR);
    // land on a ledge from above (ledges are one-way)
    if (!c.ground && c.vy <= 0) {
      for (const pl of this.plats) {
        if (pl.fallen) continue;
        if (prevY >= pl.y - 0.05 && c.y <= pl.y && Math.abs(c.x - pl.x) <= pl.w / 2 + 0.18) {
          c.y = pl.y;
          c.vy = 0;
          c.ground = pl;
          this.fx.dust({ x: c.x, y: pl.y, z: 0 }, 5, "#c0a0a0");
          if (pl.kind === "crumble" && pl.crumbleT < 0) {
            pl.crumbleT = 0;
            this.sound("click");
          }
          if (pl.kind === "top" && !c.done) {
            this.reachTop(i);
            a.pos.set(c.x, c.y, 0);
            return;
          }
          break;
        }
      }
    }
    if (c.ground?.kind === "crumble" && c.ground.crumbleT < 0) c.ground.crumbleT = 0;
    // anims
    const sp = Math.abs(c.vx);
    if (sp > 0.4) a.face(c.vx > 0 ? Math.PI / 2 : -Math.PI / 2, dt);
    else a.face(0, dt, 5);
    a.anim = c.ground ? (sp > 0.5 ? "run" : "idle") : c.vy > 0 ? "jump" : "fall";
    a.speed = clamp(sp / SPEED, 0, 1);
    // shadow on the ledge below
    let gy = -50;
    for (const pl of this.plats) if (!pl.fallen && pl.y <= c.y + 0.01 && pl.y > gy && Math.abs(c.x - pl.x) <= pl.w / 2) gy = pl.y;
    a.groundY = Math.max(gy, this.lavaY);
    a.pos.set(c.x, c.y, 0);
    if (c.y > c.best + 0.5 || Math.floor(c.y) !== Math.floor(c.best)) {
      c.best = Math.max(c.best, c.y);
      this.hud.setScore(this.players[i].seat, `${Math.max(0, Math.floor(c.y))} m`);
    }
    // the lava!
    if (c.y < this.lavaY + 0.15) this.burn(i);
  }

  private reachTop(i: number) {
    const c = this.cs[i];
    c.done = true;
    c.doneT = this.t;
    this.hud.setScore(this.players[i].seat, T("Safe!", "脱险！"));
    this.hud.banner(T(`${this.players[i].name} escapes!`, `${this.players[i].name} 逃出来了！`), { color: "#ffd23f", ms: 1300 });
    this.sound("fanfare");
    this.fx.confetti({ x: c.x, y: c.y + 2, z: 0 }, 70);
    this.buzz(i, [60, 40, 60, 40, 120]);
  }

  private burn(i: number) {
    const c = this.cs[i];
    if (c.out) return;
    c.out = true;
    c.outT = this.t;
    c.vy = 15;
    c.ground = null;
    const a = this.avatars[i];
    a.anim = "fall";
    a.flash();
    a.setRing(null);
    this.hud.mark(this.players[i].seat, "out");
    this.hud.setScore(this.players[i].seat, T("Toast!", "烤焦了！"));
    this.fx.explosion({ x: c.x, y: this.lavaY + 0.3, z: 0.3 }, 1.6);
    this.fx.burst({ x: c.x, y: this.lavaY + 0.2, z: 0.3 }, { count: 20, colors: ["#ffe14a", "#ff7a2a"], speed: 5, up: 6, gravity: 18, size: 0.2, life: 0.9, shape: "ball" });
    this.sound("explode");
    this.sound("boing");
    this.shake = 0.4;
    this.buzz(i, [120, 50, 120]);
  }

  private updatePlats(dt: number, live: boolean) {
    const t = this.t;
    for (const p of this.plats) {
      if (p.kind === "move") {
        const nx = p.x0 + Math.sin(t * p.freq + p.ph) * p.amp;
        p.dx = live ? nx - p.x : 0;
        p.x = nx;
      } else p.dx = 0;
      if (p.kind === "crumble" && !p.fallen && p.crumbleT >= 0 && live) {
        p.crumbleT += dt;
        if (p.crumbleT > 0.6) {
          p.fallen = true;
          p.vy = 0;
          this.sound("crash");
          this.fx.burst({ x: p.x, y: p.y, z: 0 }, { count: 12, colors: ["#d29a5a", "#8a5a3a"], speed: 3, up: 1, size: 0.2, life: 0.8, gravity: 12 });
          for (const c of this.cs) if (c.ground === p) c.ground = null;
        }
      }
      if (p.fallen) {
        p.vy -= 25 * dt;
        p.y += p.vy * dt;
        p.mesh.rotation.z += dt * 0.6;
        if (p.y < this.lavaY - 5) p.mesh.visible = false;
      }
      const shake = p.kind === "crumble" && p.crumbleT >= 0 && !p.fallen ? Math.sin(t * 50) * 0.06 : 0;
      p.mesh.position.set(p.x + shake, p.y - PH / 2, 0);
    }
  }

  private animWorld(dt: number) {
    this.clock += dt;
    this.lavaTex.offset.x += dt * 0.03;
    this.lavaTex.offset.y += dt * 0.05;
    this.lava.position.set(0, this.lavaY - 30 + Math.sin(this.clock * 2) * 0.06, -0.2);
    this.glow.position.y = this.lavaY + 2.4;
    this.light.position.set(0, this.lavaY + 2.5, 5);
    this.light.intensity = 55 + Math.sin(this.clock * 7) * 8;
    this.flag.rotation.y = Math.sin(this.clock * 3) * 0.2;
    // embers and bubbles
    this.emberT -= dt;
    if (this.emberT <= 0) {
      this.emberT = 0.09;
      const x = (Math.random() - 0.5) * HALF_W * 2;
      this.fx.burst({ x, y: this.lavaY + 0.2, z: 0.8 + Math.random() * 2 }, { count: 1, colors: ["#ffe14a", "#ff9a2e"], speed: 0.5, up: 3, gravity: -0.5, size: 0.1, sizeEnd: 0, life: 2.2, shape: "ball", drag: 0.3 });
      if (Math.random() < 0.25) this.fx.burst({ x, y: this.lavaY + 0.1, z: 2 }, { count: 6, colors: ["#ffb02e", "#ff5a14"], speed: 1.5, up: 3, gravity: 12, size: 0.18, life: 0.6, shape: "ball" });
    }
  }
  private clock = 0;

  /** Coloured tags at the screen's edge for climbers out of the picture. */
  private updateMarks() {
    const v = new THREE.Vector3();
    this.cs.forEach((c, i) => {
      const el = this.marks[i];
      if (c.out) {
        el.style.display = "none";
        return;
      }
      v.set(c.x, c.y + 1, 0);
      const s = toScreen(v, this.camera);
      const h = VIEWPORT.h;
      if (s.y < h * 0.02) {
        el.style.display = "";
        el.textContent = `▲ ${this.players[i].name}`;
        el.style.transform = `translate(${s.x}px, ${h * 0.11}px) translate(-50%, 0)`;
      } else el.style.display = "none";
    });
  }

  private endGame() {
    // the way out first, then the highest still climbing, then by when they burnt
    const key = this.cs.map((c) => (c.done ? 1e6 - c.doneT : c.out ? c.outT : 1e3 + c.y));
    const place = key.map((k) => 1 + key.filter((o) => o > k + 1e-6).length);
    this.cs.forEach((c, i) => {
      if (place[i] === 1) this.hud.mark(this.players[i].seat, "win");
    });
    this.finish(place);
  }

  protected outroStep(dt: number) {
    this.animWorld(dt);
    this.updatePlats(dt, false);
    this.cs.forEach((c, i) => {
      const a = this.avatars[i];
      if (c.out) {
        c.burnT += dt;
        c.vy -= 24 * dt;
        c.y += c.vy * dt;
        a.pos.set(c.x, c.y, 0.3);
        if (c.y < this.lavaY - 1.5) a.setVisible(false);
        return;
      }
      if (!c.ground) {
        c.vy = Math.max(-MAX_FALL, c.vy - FALL_GRAV * dt);
        const prevY = c.y;
        c.y += c.vy * dt;
        for (const pl of this.plats)
          if (!pl.fallen && prevY >= pl.y - 0.05 && c.y <= pl.y && Math.abs(c.x - pl.x) <= pl.w / 2 + 0.18) {
            c.y = pl.y;
            c.vy = 0;
            c.ground = pl;
          }
      }
      a.pos.set(c.x, c.y, 0);
      a.face(0, dt, 5);
      if (c.done && Math.random() < dt * 1.5) this.fx.confetti({ x: c.x, y: c.y + 2.5, z: 0 }, 14);
    });
  }

  dispose() {
    super.dispose();
    for (const t of this.ownTex) t.dispose();
    for (const m of this.moveMats) m.dispose();
    for (const el of this.marks) el.remove();
  }
}

const def: MiniDef = {
  id: "lave-montante",
  name: "Rising Lava",
  icon: "🌋",
  color: "#ff5a1e",
  tagline: "Climb from platform to platform: the lava is rising!",
  rules: "Climb to the volcano's exit before the lava catches you. Some platforms move, some crumble. Hold A to jump higher.",
  controls: { stick: "Run", a: "Jump (hold = higher)" },
  modes: ["ffa"],
  length: 55,
  music: "tense",
  create: (ctx) => new LaveMontante(ctx),
};
export default def;
