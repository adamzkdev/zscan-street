/**
 * BOWLING GÉANT (1 contre 3): a giant bowling lane. The trio are the "pins" on the wide pin deck at
 * the far end: they move left/right and back/forth to dodge. The solo slides a huge ball left/right,
 * A launches it, and the stick curves it while it rolls. 3 throws; a pin hit by the ball (or by a
 * pin flying off) tumbles into the pit. The solo wins if all three are down, the trio otherwise.
 */
import * as THREE from "three";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef } from "../types";
import { GEO, ball, box, canvasTex, cyl, flat, group, toon } from "../../engine/gfx";
import { clamp, dist2 } from "../../engine/util";
import { music } from "../../engine/audio";
import { T } from "../../../../i18n/lang";

const LANE = 6.5; // lane half-width (gutters beyond)
const DECK_Z0 = -12; // the pin deck
const DECK_Z1 = -5.5;
const PIN_X = 6.1;
const PR = 0.42; // pin (player) radius
const BALL_R = 1.35;
const BALL_Z0 = 9.2;
const BALL_V = 12.5;
const CURVE = 5.9;
const MAX_VX = 8.5;
const PIN_SPEED = 3.85;
const AIM_TIME = 5;
const THROWS = 3;
const PIT_Z = -13.4;
/** A tumbling pin knocks a standing one within this distance (chain reaction). */
const CHAIN = 0.9;

interface Pin {
  x: number;
  z: number;
  vx: number;
  vz: number;
  down: boolean;
  /** Tumbling: velocity, height, time. */
  ty: number;
  tvx: number;
  tvy: number;
  tvz: number;
  tt: number;
  spin: number;
  restX: number;
  restZ: number;
  goal: { x: number; z: number };
  think: number;
}

type Phase = "aim" | "roll" | "reset" | "done";

class BowlingGeant extends BaseMini {
  private pins: Pin[] = [];
  private ball!: THREE.Group;
  private ballSpin!: THREE.Group;
  private b = { x: 0, z: BALL_Z0, vx: 0, y: BALL_R, gutter: false };
  private phase: Phase = "aim";
  private phaseT = 0;
  private throwN = 0;
  private downThisThrow = 0;
  private guide!: THREE.Mesh;
  private lights: THREE.Mesh[] = [];
  private sign!: THREE.Mesh;
  private signT = 0;
  private rollSound = 0;
  private tipEl: HTMLElement | null = null;
  // CPU bowler
  private aimX = 0;
  private aimWait = 1;

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#1c1236", "#47306e"], size: 18, sun: [0.3, 1, 0.5], hemi: ["#ffffff", "#6a5a8a", 1.6], fog: { near: 60, far: 120 } });
    this.buildAlley();
    // the bowler behind the ball, the pins on the deck
    const ba = this.spawn(0, 0, BALL_Z0 + 2.2, Math.PI);
    ba.setRing(this.players[0].char.color);
    const spots = [
      [-3.6, -8.2],
      [0, -9.6],
      [3.6, -8.2],
    ];
    for (let k = 1; k < this.players.length; k++) {
      const [x, z] = spots[(k - 1) % 3];
      const a = this.spawn(k, x, z, 0);
      a.setRing(this.players[k].char.color);
      this.pins[k] = { x, z, vx: 0, vz: 0, down: false, ty: 0, tvx: 0, tvy: 0, tvz: 0, tt: 0, spin: 0, restX: 0, restZ: 0, goal: { x, z }, think: 0 };
    }
    this.hud.players(this.players, (p) => (p.team === 0 ? this.ballTag(1) : T("Standing!", "站着！")), { teams: true });
    this.setCam([0, 34, 34], [0, 0, -1], 42);
  }

  /** The bowler's card: which ball this is. */
  private ballTag(n: number) {
    return T(`🎳 Ball ${n}/${THROWS}`, `🎳 第 ${n}/${THROWS} 球`);
  }

  // ------------------------------------------------------------ the alley

  private buildAlley() {
    const s = this.scene;
    // floor of the hall
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), toon("#2e2448"));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.4;
    floor.receiveShadow = true;
    s.add(floor);
    // carpet with a retro pattern on the approach
    const carpet = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = "#3b2a6a";
      g.fillRect(0, 0, w, h);
      const cols = ["#ff5ab4", "#36d6ff", "#ffd23f"];
      for (let k = 0; k < 40; k++) {
        g.strokeStyle = cols[k % 3];
        g.lineWidth = 5;
        const x = (k * 53) % w,
          y = (k * 97) % h;
        g.beginPath();
        if (k % 2) g.arc(x, y, 14, 0, Math.PI * 1.3);
        else {
          g.moveTo(x - 14, y);
          g.lineTo(x, y - 12);
          g.lineTo(x + 14, y);
        }
        g.stroke();
      }
    }, true);
    carpet.repeat.set(8, 3);
    const cm = new THREE.Mesh(new THREE.PlaneGeometry(40, 12), new THREE.MeshToonMaterial({ map: carpet }));
    cm.rotation.x = -Math.PI / 2;
    cm.position.set(0, -0.38, 17);
    cm.receiveShadow = true;
    s.add(cm);

    // the lane: wooden planks, arrows and dots
    const len = 26;
    const tex = canvasTex(512, 1024, (g, w, h) => {
      for (let i = 0; i < 26; i++) {
        g.fillStyle = ["#e9c48a", "#e2b97c", "#efcf98", "#dcb274"][i % 4];
        g.fillRect((i * w) / 26, 0, w / 26 + 1, h);
        g.fillStyle = "rgba(120,70,20,0.18)";
        g.fillRect((i * w) / 26, 0, 1.5, h);
      }
      // the arrows
      g.fillStyle = "#5a3a1e";
      for (let k = -3; k <= 3; k++) {
        const x = w / 2 + k * 60,
          y = h * 0.62 - Math.abs(k) * 22;
        g.beginPath();
        g.moveTo(x, y - 26);
        g.lineTo(x + 12, y + 10);
        g.lineTo(x - 12, y + 10);
        g.closePath();
        g.fill();
      }
      for (let k = -4; k <= 4; k++) {
        g.beginPath();
        g.arc(w / 2 + k * 50, h * 0.86, 7, 0, Math.PI * 2);
        g.fill();
      }
      // the foul line
      g.fillStyle = "#c8323c";
      g.fillRect(0, h * 0.93, w, 8);
    });
    const lane = new THREE.Mesh(new THREE.BoxGeometry(LANE * 2, 0.4, len), [toon("#c79a5e"), toon("#c79a5e"), new THREE.MeshToonMaterial({ map: tex }), toon("#c79a5e"), toon("#c79a5e"), toon("#c79a5e")]);
    lane.position.set(0, -0.2, PIT_Z + 0.6 + len / 2);
    lane.receiveShadow = true;
    s.add(lane);
    // the pin deck: painted spots
    const deckTex = canvasTex(512, 256, (g, w, h) => {
      g.fillStyle = "#f3dcae";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "rgba(200,50,60,0.55)";
      for (let r = 0; r < 4; r++)
        for (let c = 0; c <= r; c++) {
          const x = w / 2 + (c - r / 2) * 70,
            y = h * 0.85 - r * 52;
          g.beginPath();
          g.arc(x, y, 16, 0, Math.PI * 2);
          g.fill();
        }
    });
    const deck = new THREE.Mesh(new THREE.PlaneGeometry(LANE * 2, DECK_Z1 - DECK_Z0 + 0.8), new THREE.MeshToonMaterial({ map: deckTex, transparent: true, opacity: 0.85 }));
    deck.rotation.x = -Math.PI / 2;
    deck.position.set(0, 0.01, (DECK_Z0 + DECK_Z1) / 2);
    deck.receiveShadow = true;
    s.add(deck);
    // the deck's border line (where pins stop)
    box(s, flat("#ff4b8b"), LANE * 2, 0.03, 0.14, { y: 0.02, z: DECK_Z1 + 0.4, cast: false });
    // gutters and side bumpers
    for (const sx of [-1, 1]) {
      const gut = cyl(s, "#8a8aa0", 0.75, len, { x: sx * (LANE + 0.75), y: -0.15, z: PIT_Z + 0.6 + len / 2, rx: Math.PI / 2, seg: 16 });
      gut.receiveShadow = true;
      box(s, "#2a2040", 0.6, 1.2, len + 6, { x: sx * (LANE + 1.8), y: 0.2, z: PIT_Z + 3 + len / 2 });
      // neon strips
      const neon = box(s, flat(sx < 0 ? "#ff5ab4" : "#36d6ff"), 0.12, 0.12, len + 6, { x: sx * (LANE + 1.5), y: 0.82, z: PIT_Z + 3 + len / 2, cast: false });
      this.lights.push(neon);
    }
    // the pit and the back wall with its curtain
    box(s, "#120c20", LANE * 2 + 3, 0.3, 3, { y: -0.6, z: PIT_Z - 1.4 });
    const back = group(s, { z: PIT_Z - 3 });
    box(back, "#2a1d48", 30, 12, 1, { y: 5 });
    const curtain = canvasTex(256, 128, (g, w, h) => {
      for (let i = 0; i < 16; i++) {
        g.fillStyle = i % 2 ? "#1a1230" : "#241a40";
        g.fillRect((i * w) / 16, 0, w / 16 + 1, h);
      }
    });
    const cur = new THREE.Mesh(new THREE.PlaneGeometry(LANE * 2 + 2, 3.2), new THREE.MeshBasicMaterial({ map: curtain }));
    cur.position.set(0, 1.6, 0.52);
    back.add(cur);
    // the big "STRIKE" sign
    const signTex = canvasTex(1024, 256, (g, w, h) => {
      g.fillStyle = "#1a1230";
      g.beginPath();
      g.roundRect(8, 8, w - 16, h - 16, 60);
      g.fill();
      g.lineWidth = 14;
      g.strokeStyle = "#ffd23f";
      g.stroke();
      let fs = 150;
      g.font = `900 ${fs}px "Lilita One", "Fredoka", sans-serif`;
      while (fs > 60 && g.measureText("ZK BOWLING").width > w - 120) g.font = `900 ${(fs -= 6)}px "Lilita One", "Fredoka", sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = "#ff5ab4";
      g.fillText("ZK BOWLING", w / 2, h / 2 + 8);
    });
    this.sign = new THREE.Mesh(new THREE.PlaneGeometry(12, 3), new THREE.MeshBasicMaterial({ map: signTex, transparent: true }));
    this.sign.position.set(0, 5.3, 0.55);
    back.add(this.sign);
    // light bulbs around the sign
    for (let k = 0; k < 22; k++) {
      const a = (k / 22) * Math.PI * 2;
      const m = ball(back, flat(k % 2 ? "#ffd23f" : "#ffffff"), 0.16, { x: Math.cos(a) * 6.6, y: 5.3 + Math.sin(a) * 2.1, z: 0.6, cast: false });
      this.lights.push(m);
    }
    // giant decorative pins on both sides of the deck
    const prof: THREE.Vector2[] = [];
    const P = [
      [0, 0],
      [0.32, 0],
      [0.42, 0.35],
      [0.45, 0.7],
      [0.36, 1.05],
      [0.2, 1.35],
      [0.17, 1.5],
      [0.24, 1.75],
      [0.22, 1.95],
      [0.12, 2.08],
      [0, 2.12],
    ];
    for (const [x, y] of P) prof.push(new THREE.Vector2(x, y));
    const pinGeo = new THREE.LatheGeometry(prof, 18);
    for (const [x, z, sc, rz] of [
      [-LANE - 4, -9, 2.4, 0],
      [-LANE - 5.6, -6.6, 2.0, 0.08],
      [LANE + 4, -9, 2.4, 0],
      [LANE + 5.6, -6.6, 2.0, -0.08],
      [-LANE - 4.2, 4, 1.8, 0],
      [LANE + 4.2, 4, 1.8, 0],
    ]) {
      const g = group(s, { x, z, rz });
      const m = new THREE.Mesh(pinGeo, toon("#ffffff"));
      m.scale.setScalar(sc);
      m.castShadow = true;
      g.add(m);
      for (const y of [1.36, 1.5]) cyl(g, "#e8323c", 0.2 * sc, 0.06 * sc, { y: y * sc, seg: 16 });
    }
    // the ball return and the bowler's bench
    const ret = group(s, { x: LANE + 3.2, z: 12 });
    box(ret, "#3a2a6a", 1.8, 1.1, 3, { y: 0.15 });
    ball(ret, "#36d6ff", 0.5, { y: 1.0, z: -0.6 });
    ball(ret, "#ff5ab4", 0.5, { y: 1.0, z: 0.5 });
    // the ball itself
    this.ball = group(s, { x: 0, y: BALL_R, z: BALL_Z0 });
    this.ballSpin = group(this.ball);
    const col = this.players[0].char.color;
    const ballTex = canvasTex(512, 256, (g, w, h) => {
      g.fillStyle = col;
      g.fillRect(0, 0, w, h);
      g.globalAlpha = 0.35;
      for (let k = 0; k < 14; k++) {
        g.strokeStyle = k % 2 ? "#ffffff" : "#1d1630";
        g.lineWidth = 10 + (k % 3) * 6;
        g.beginPath();
        g.moveTo(0, (k * 37) % h);
        g.bezierCurveTo(w * 0.3, ((k * 71) % h) - 40, w * 0.6, ((k * 53) % h) + 40, w, (k * 37) % h);
        g.stroke();
      }
    });
    const bm = new THREE.Mesh(GEO.sphere, new THREE.MeshToonMaterial({ map: ballTex }));
    bm.scale.setScalar(BALL_R);
    bm.castShadow = true;
    this.ballSpin.add(bm);
    for (const [x, y] of [
      [-0.3, 0.5],
      [0.3, 0.5],
      [0, 0.1],
    ]) {
      const d = new THREE.Vector3(x, y, 1).normalize().multiplyScalar(BALL_R * 0.97);
      const h = ball(this.ballSpin, flat("#1d1630"), [0.18, 0.18, 0.05], { x: d.x, y: d.y, z: d.z, cast: false });
      h.lookAt(d.clone().multiplyScalar(2));
    }
    // the aiming guide (a dashed strip down the lane)
    const guideTex = canvasTex(32, 256, (g, w, h) => {
      for (let y = 0; y < h; y += 32) {
        g.fillStyle = "rgba(255,255,255,0.9)";
        g.fillRect(4, y, w - 8, 18);
      }
    }, true);
    guideTex.repeat.set(1, 5);
    this.guide = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 20), new THREE.MeshBasicMaterial({ map: guideTex, transparent: true, opacity: 0.55, depthWrite: false }));
    this.guide.rotation.x = -Math.PI / 2;
    this.guide.position.set(0, 0.03, BALL_Z0 - 10.5);
    s.add(this.guide);
    // spectators' seats behind the bowler
    for (let k = 0; k < 6; k++) {
      const x = -10 + k * 4;
      box(s, "#ff5ab4", 2.4, 0.5, 1.2, { x, y: -0.1, z: 19 });
      box(s, "#ff5ab4", 2.4, 1.2, 0.3, { x, y: 0.5, z: 19.6 });
    }
  }

  // ------------------------------------------------------------ CPUs

  protected cpu(i: number, _dt: number): CpuPad {
    const lv = this.players[i].level;
    return i === 0 ? this.cpuBowler(lv) : this.cpuPin(i, lv);
  }

  private standing() {
    return this.pins.filter((p) => p && !p.down);
  }

  private cpuBowler(lv: number): CpuPad {
    const up = this.standing();
    if (!up.length) return {};
    if (this.phase === "aim") {
      // line up with the pin that's easiest to reach, then throw
      if (this.cpuAfter(0, "pick", 0.1)) {
        let best = up[0],
          bs = 1e9;
        for (const p of up) {
          const near = up.filter((o) => Math.abs(o.x - p.x) < 2.5).length;
          const s = Math.abs(p.x - this.b.x) * 0.2 - near * 2 + Math.random() * (1 - lv) * 3;
          if (s < bs) {
            bs = s;
            best = p;
          }
        }
        this.aimX = clamp(best.x + (Math.random() - 0.5) * (1 - lv) * 2.5, -LANE + BALL_R, LANE - BALL_R);
        this.aimWait = 1.0 + Math.random() * 1.8;
        this.cpuReset(0, "pick");
        this.cpuAfter(0, "pick", 99);
      }
      const dx = this.aimX - this.b.x;
      const go = Math.abs(dx) < 0.3 && this.phaseT > this.aimWait;
      return { x: clamp(dx * 1.5, -1, 1), a: go };
    }
    if (this.phase === "roll") {
      this.cpuReset(0, "pick");
      // steer toward the standing pin the ball can still reach (reaction lag by level)
      if (!this.cpuAfter(0, "steer", 0.35 - 0.25 * lv)) return {};
      let best: Pin | null = null,
        bs = 1e9;
      for (const p of up) {
        const tArr = (this.b.z - p.z) / BALL_V;
        if (tArr < 0) continue;
        const px = p.x + p.vx * tArr * (0.3 + 0.5 * lv);
        const need = Math.abs(px - (this.b.x + this.b.vx * tArr));
        const reach = 0.5 * CURVE * tArr * tArr + 0.5;
        const s = need - reach;
        if (s < bs) {
          bs = s;
          best = p;
        }
      }
      if (!best) return {};
      const tArr = Math.max(0.05, (this.b.z - best.z) / BALL_V);
      const px = best.x + best.vx * tArr * (0.3 + 0.5 * lv);
      // the acceleration that lands the ball on px
      const ax = (2 * (px - this.b.x - this.b.vx * tArr)) / (tArr * tArr);
      const k = clamp(ax / CURVE, -1, 1) * (0.7 + 0.3 * lv);
      return { x: k };
    }
    this.cpuReset(0, "steer");
    return {};
  }

  private cpuPin(i: number, lv: number): CpuPad {
    const p = this.pins[i];
    if (!p || p.down) return {};
    const b = this.b;
    if (this.t >= p.think) {
      p.think = this.t + 0.15 + 0.3 * (1 - lv) + Math.random() * 0.1;
      if (this.phase === "roll" && !b.gutter) {
        // where will the ball cross my line? dodge to the side with room
        const tArr = (b.z - p.z) / BALL_V;
        if (tArr > -0.1) {
          const ax = (b.vx - (this.prevVx ?? b.vx)) / Math.max(1e-3, this.lastDt) || 0;
          const guess = lv > 0.5 ? 0.5 * clamp(ax, -CURVE, CURVE) * tArr * tArr * 0.6 : 0;
          const bx = b.x + b.vx * tArr + guess;
          const gap = Math.abs(bx - p.x);
          if (gap < BALL_R + PR + 1.4) {
            let side = p.x >= bx ? 1 : -1;
            if (Math.abs(p.x + side * 3) > PIN_X) side = -side;
            p.goal = { x: clamp(bx + side * (BALL_R + 2.6), -PIN_X, PIN_X), z: p.z + (this.rnd() < 0.5 ? -1 : 1) * 0.5 };
          }
        }
      } else if (this.phase === "aim" || this.phase === "reset") {
        // spread out, away from the ball's line, and keep moving a little
        const others = this.standing().filter((o) => o !== p);
        let best = { x: p.x, z: p.z },
          bs = -1e9;
        for (let k = 0; k < 8; k++) {
          const cand = { x: (Math.random() * 2 - 1) * PIN_X, z: DECK_Z0 + 0.5 + Math.random() * (DECK_Z1 - DECK_Z0 - 1) };
          let s = Math.min(4, Math.abs(cand.x - b.x)) * (0.5 + lv);
          for (const o of others) s += Math.min(3.5, dist2(cand.x, cand.z, o.x, o.z)) * 0.8;
          s -= dist2(cand.x, cand.z, p.x, p.z) * 0.15;
          s += (DECK_Z1 - cand.z) * 0.15 * lv; // the back gives more time
          if (s > bs) {
            bs = s;
            best = cand;
          }
        }
        if (Math.random() < 0.35) p.goal = best;
      }
    }
    const dx = p.goal.x - p.x,
      dz = p.goal.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.2) return {};
    const k = Math.min(1, d / 0.6);
    return { x: (dx / d) * k, y: (dz / d) * k };
  }
  private prevVx: number | null = null;
  private lastDt = 1 / 60;

  // ------------------------------------------------------------ the game

  protected idle(dt: number) {
    this.camFor(dt, 1.5);
    this.decor(dt);
  }

  start() {
    this.hud.banner(T(`Ball 1 / ${THROWS}`, `第 1 / ${THROWS} 球`), { color: "#ffd23f", sub: T("Pins: dodge the ball!", "球瓶：躲开保龄球！"), ms: 1300 });
    this.tipEl = this.hud.add(`<div style="position:absolute;left:50%;top:calc(var(--u)*8);transform:translateX(-50%);padding:calc(var(--u)*0.6) calc(var(--u)*1.8);background:rgba(20,14,40,0.75);border-radius:999px;font-size:calc(var(--u)*1.6);font-weight:600;white-space:nowrap">${T("🎳 Bowler: stick = aim, <b>A</b> = bowl, then stick = spin &nbsp;·&nbsp; Pins: dodge!", "🎳 投球手：摇杆瞄准，<b>A</b> 投球，再用摇杆加旋转 &nbsp;·&nbsp; 球瓶：快躲！")}</div>`);
    this.sound("bell");
  }

  /** Overview while aiming; while the ball rolls, a chase cam that ends close to the pins. */
  private camFor(dt: number, rate: number) {
    if (this.phase === "roll") {
      const z = Math.max(this.b.z, -4.5);
      const x = this.b.x * 0.35;
      this.moveCam([x, 11.5, z + 12.5], [x * 1.2, 0, z - 6], dt, 2.6);
    } else this.moveCam([0, 24, 25], [0, 0, 0.5], dt, rate);
  }

  private decor(dt: number) {
    this.signT += dt;
    this.lights.forEach((m, k) => (m.visible = k < 2 || Math.floor(this.signT * 4 + k) % 3 !== 0));
    const sc = 1 + Math.max(0, 0.15 - this.signT * 0.3) * 2;
    this.sign.scale.setScalar(sc);
  }

  protected step(dt: number) {
    this.lastDt = dt;
    this.phaseT += dt;
    this.camFor(dt, 3);
    this.decor(dt);
    if (this.t > 7 && this.tipEl) {
      this.tipEl.remove();
      this.tipEl = null;
    }
    const p0 = this.pad(0);
    const bowler = this.avatars[0];
    const b = this.b;
    this.prevVx = b.vx;

    if (this.phase === "aim") {
      const left = AIM_TIME - this.phaseT;
      this.hud.timer(left);
      b.x = clamp(b.x + p0.x * 6 * dt, -LANE + BALL_R * 0.8, LANE - BALL_R * 0.8);
      b.z = BALL_Z0;
      b.vx = 0;
      bowler.pos.set(b.x, 0, BALL_Z0 + 2.2);
      bowler.anim = Math.abs(p0.x) > 0.2 ? "run" : "hold";
      bowler.speed = 0.4;
      bowler.face(Math.PI, dt);
      this.guide.visible = true;
      this.guide.position.x = b.x;
      if ((p0.aDown && this.phaseT > 0.3) || left <= 0) this.launch();
    } else if (this.phase === "roll") {
      this.hud.timer(null);
      this.guide.visible = false;
      if (!b.gutter) {
        b.vx = clamp(b.vx + p0.x * CURVE * dt, -MAX_VX, MAX_VX);
        b.x += b.vx * dt;
        if (Math.abs(b.x) > LANE - 0.35) {
          b.gutter = true;
          this.sound("slide");
          this.hud.pop(new THREE.Vector3(b.x, 2, b.z), T("Gutter!", "洗沟！"), "#ff9a5a", this.camera);
        }
      } else {
        b.x += (Math.sign(b.x) * (LANE + 0.75) - b.x) * (1 - Math.exp(-10 * dt));
        b.y += (BALL_R - 1.0 - b.y) * (1 - Math.exp(-10 * dt));
        b.vx = 0;
      }
      b.z -= BALL_V * dt;
      this.ballSpin.rotation.x -= (BALL_V * dt) / BALL_R;
      this.ballSpin.rotation.z -= (b.vx * dt) / BALL_R;
      this.rollSound -= dt;
      if (this.rollSound <= 0) {
        this.rollSound = 0.2;
        this.sound("engine");
        this.shake = Math.max(this.shake, 0.08);
      }
      bowler.anim = this.phaseT < 0.4 ? "throw" : "idle";
      // knock the pins over
      if (!b.gutter)
        this.pins.forEach((p, i) => {
          if (!p || p.down) return;
          if (dist2(p.x, p.z, b.x, b.z) < BALL_R + PR) this.knock(i, b.vx * 0.6 + (p.x - b.x) * 2.5, -BALL_V * 0.55, 1);
        });
      if (b.z < PIT_Z - 0.5) {
        b.y -= dt * 6;
        if (b.z < PIT_Z - 2.2) this.endThrow();
      }
    } else if (this.phase === "reset") {
      this.hud.timer(null);
      // the new ball rolls back into the bowler's hands
      const k = clamp(this.phaseT / 1.2, 0, 1);
      b.x = b.x * (1 - k);
      b.y = BALL_R;
      b.z = BALL_Z0;
      this.ball.visible = k > 0.4;
      this.ball.scale.setScalar(clamp((k - 0.4) / 0.6, 0.01, 1));
      bowler.anim = "idle";
      bowler.pos.x += (b.x - bowler.pos.x) * (1 - Math.exp(-8 * dt));
      if (this.phaseT > 1.4) {
        this.phase = "aim";
        this.phaseT = 0;
        b.gutter = false;
        this.ball.scale.setScalar(1);
        this.ball.visible = true;
        this.hud.banner(this.throwN === THROWS - 1 ? T("LAST BALL!", "最后一球！") : T(`Ball ${this.throwN + 1} / ${THROWS}`, `第 ${this.throwN + 1} / ${THROWS} 球`), { color: "#ffd23f", ms: 1000 });
        this.hud.setScore(this.players[0].seat, this.ballTag(this.throwN + 1));
        if (this.throwN === THROWS - 1) music.speed(1.15);
      }
    } else if (this.phase === "done") {
      if (this.phaseT > 1.0) this.finishByTeam(this.standing().length === 0 ? 0 : 1);
    }
    this.ball.position.set(b.x, b.y, b.z);

    this.stepPins(dt);
  }

  private launch() {
    this.phase = "roll";
    this.phaseT = 0;
    this.b.vx = 0;
    this.b.gutter = false;
    this.downThisThrow = 0;
    this.sound("whoosh");
    this.sound("thud");
    this.shake = 0.25;
    this.buzz(0, 50);
    this.avatars[0].anim = "throw";
    this.fx.dust({ x: this.b.x, y: 0, z: this.b.z }, 10, "#f3dcae");
  }

  private endThrow() {
    this.throwN++;
    const up = this.standing().length;
    if (this.downThisThrow >= 3) this.hud.banner(T("STRIKE!", "全中！"), { color: "#ff5ab4", size: 12 });
    else if (this.downThisThrow === 0) this.hud.banner(T("MISS!", "没中！"), { color: "#9fd0ff", size: 8 });
    else this.hud.banner(this.downThisThrow === 1 ? T("ONE PIN!", "一个球瓶！") : T(`${this.downThisThrow} PINS!`, `${this.downThisThrow} 个球瓶！`), { color: "#ffd23f", size: 8 });
    if (up === 0 || this.throwN >= THROWS) {
      this.phase = "done";
      this.phaseT = 0;
      this.ball.visible = false;
      if (up === 0) this.sound("fanfare");
      else this.sound("cheer");
    } else {
      this.phase = "reset";
      this.phaseT = 0;
      this.ball.visible = false;
      this.sound(this.downThisThrow ? "cheer" : "aww");
    }
  }

  private knock(i: number, vx: number, vz: number, power: number) {
    const p = this.pins[i];
    p.down = true;
    p.tvx = vx;
    p.tvz = vz;
    p.tvy = 7 + 3 * power;
    p.ty = 0;
    p.tt = 0;
    p.spin = (Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 6);
    this.downThisThrow++;
    this.signT = 0;
    this.sound("crash");
    this.sound("bonk");
    this.shake = Math.max(this.shake, 0.5);
    this.buzz(i, [150, 50, 150]);
    this.buzz(0, 60);
    this.avatars[i].flash();
    this.fx.burst({ x: p.x, y: 1, z: p.z }, { count: 22, colors: ["#ffffff", "#ffd23f", "#ff5ab4", this.players[i].char.color], speed: 8, up: 3, size: 0.2, life: 0.8 });
    this.fx.ring({ x: p.x, y: 0.05, z: p.z }, "#ffffff", 2.2, 0.4);
    this.hud.pop(new THREE.Vector3(p.x, 2.5, p.z), T("Knocked over!", "被击倒！"), "#ff5ab4", this.camera);
    this.hud.setScore(this.players[i].seat, T("💥 Down", "💥 倒了"));
    this.avatars[i].setRing(null);
    this.hud.mark(this.players[i].seat, "out");
  }

  private stepPins(dt: number) {
    const rolling = this.phase === "roll";
    this.pins.forEach((p, i) => {
      if (!p) return;
      const a = this.avatars[i];
      if (p.down) {
        p.tt += dt;
        if (p.tt < 1.6) {
          p.tvy -= 22 * dt;
          p.x += p.tvx * dt;
          p.z += p.tvz * dt;
          p.ty = Math.max(0, p.ty + p.tvy * dt);
          if (p.ty === 0 && p.tvy < 0) {
            p.tvy = -p.tvy * 0.35;
            p.tvx *= 0.6;
            p.tvz *= 0.6;
          }
          p.x = clamp(p.x, -LANE - 1.2, LANE + 1.2);
          p.z = Math.max(p.z, PIT_Z - 1.6);
          // tumble (the root: the avatar's own animation doesn't reset it)
          a.root.rotation.z += p.spin * dt * Math.max(0, 1 - p.tt);
          a.root.rotation.x += p.spin * 0.5 * dt * Math.max(0, 1 - p.tt);
          a.anim = "fall";
          // chain reaction: a flying pin knocks the others
          if (p.tt < 0.6)
            this.pins.forEach((o, j) => {
              if (!o || o.down || j === i) return;
              if (dist2(o.x, o.z, p.x, p.z) < CHAIN && p.ty < 1.8) this.knock(j, p.tvx * 0.6 + (o.x - p.x) * 3, p.tvz * 0.5 - 2, 0.6);
            });
        } else {
          // lying flat like a knocked-down pin (in the pit if it flew that far), seeing stars
          a.anim = "stun";
          const k = 1 - Math.exp(-8 * dt);
          const wrap = (v: number) => v - Math.round(v / (Math.PI * 2)) * Math.PI * 2;
          a.root.rotation.x = wrap(a.root.rotation.x);
          a.root.rotation.z = wrap(a.root.rotation.z);
          a.root.rotation.z += ((p.spin > 0 ? 0.25 : -0.25) - a.root.rotation.z) * k;
          a.root.rotation.x += (-1.45 - a.root.rotation.x) * k;
          p.ty += ((p.z < PIT_Z + 0.2 ? -0.42 : 0) + 0.3 - p.ty) * k;
        }
        a.yaw = 0;
        a.pos.set(p.x, p.ty, p.z);
        a.groundY = -50; // hides the blob shadow (it would turn with the body)
        return;
      }
      const pad = this.pad(i);
      const l = Math.hypot(pad.x, pad.y);
      const sx = l > 1 ? pad.x / l : pad.x,
        sz = l > 1 ? pad.y / l : pad.y;
      const k = 1 - Math.exp(-12 * dt);
      p.vx += (sx * PIN_SPEED - p.vx) * k;
      p.vz += (sz * PIN_SPEED - p.vz) * k;
      p.x = clamp(p.x + p.vx * dt, -PIN_X, PIN_X);
      p.z = clamp(p.z + p.vz * dt, DECK_Z0, DECK_Z1);
      // pins don't overlap
      for (const o of this.standing()) {
        if (o === p) continue;
        const dx = p.x - o.x,
          dz = p.z - o.z,
          d = Math.hypot(dx, dz);
        if (d < PR * 2 && d > 1e-4) {
          p.x += (dx / d) * (PR * 2 - d) * 0.5;
          p.z += (dz / d) * (PR * 2 - d) * 0.5;
        }
      }
      const v = Math.hypot(p.vx, p.vz);
      a.anim = v > 0.5 ? "run" : rolling ? "hold" : "idle";
      a.speed = clamp(v / PIN_SPEED, 0, 1);
      // pins face the ball, they waddle sideways
      a.face(0, dt, 6);
      a.pos.set(p.x, 0, p.z);
    });
  }

  /** Balance stats (headless tests). */
  simInfo() {
    return { down: this.pins.filter((p) => p && p.down).length, throws: this.throwN };
  }

  protected celebrate(res: { place: number[] }) {
    super.celebrate(res);
  }

  protected outroStep(dt: number) {
    this.decor(dt);
    const bowlerWon = this.standing().length === 0;
    if (bowlerWon) this.moveCam([this.avatars[0].pos.x * 0.5, 5, BALL_Z0 + 9], [this.avatars[0].pos.x, 1.2, BALL_Z0 + 2], dt, 2);
    else this.moveCam([0, 7, -1], [0, 0.8, -8.5], dt, 2);
    this.stepPins(dt);
  }
}

const def: MiniDef = {
  id: "bowling-geant",
  name: "Giant Bowling",
  icon: "🎳",
  color: "#e8e8f0",
  tagline: "The solo bowls, the three pins dodge.",
  rules: "The bowler has 3 balls: aim with the stick, A to bowl, then the stick adds spin. The three pins dodge on the lane. All down: the bowler wins!",
  controls: { stick: "Aim, spin / Dodge", a: "Bowl" },
  modes: ["1v3"],
  length: 30,
  music: "mini2",
  create: (ctx) => new BowlingGeant(ctx),
};
export default def;
