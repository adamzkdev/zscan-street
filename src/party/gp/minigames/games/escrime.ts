/**
 * FENCING (duel, first to 3 touches, 60 s max): two fencers on a piste in a grand hall, seen
 * from the side. Stick left/right: advance / retreat. A = lunge, in the high line (stick up) or the
 * low line (stick down or centred). B = parry (a short window) in the line the stick points to: a
 * parry in the right line leaves the attacker open for a riposte that can't be parried. A touch
 * freezes the bout ("TOUCH!"), then "EN GARDE!".
 */
import * as THREE from "three";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef, MiniResult } from "../types";
import { GEO, ball, box, canvasTex, cone, cyl, group, toon } from "../../engine/gfx";
import { clamp, damp } from "../../engine/util";
import { music } from "../../engine/audio";
import { T } from "../../../../i18n/lang";

const TIME = 60;
const TARGET = 3;
const START_X = 2.3;
const PISTE = 5.6;
const WALK = 2.7;
const WINDUP = 0.17;
const LUNGE_T = 0.15;
const LUNGE_D = 0.95;
const RECOVER = 0.4;
const REACH = 1.9;
const PARRY_T = 0.28;
const PARRY_CD = 0.36;
const OPEN_T = 0.8;
const SCALE = 1.25;

type St = "guard" | "windup" | "lunge" | "recover" | "parry" | "parryCd" | "open" | "touched";
type Line = "high" | "low";

interface Fencer {
  x: number;
  st: St;
  stT: number;
  line: Line;
  /** The line of the current attack / parry. */
  act: Line;
  /** When the current lunge started (right of way). */
  startedAt: number;
  /** Ripostes are quicker and can't be parried. */
  riposte: number;
  score: number;
  walk: number;
  bufA: number;
  bufB: number;
  // CPU
  want: number;
  wantT: number;
  plan: number;
  reacted: boolean;
}

class Escrime extends BaseMini {
  private f: Fencer[] = [];
  private swords: THREE.Group[] = [];
  private blades: THREE.Mesh[] = [];
  private bladeMat: THREE.MeshToonMaterial[] = [];
  private lamps: THREE.Mesh[] = [];
  private lampMat: THREE.MeshToonMaterial[] = [];
  private freeze = 0;
  private phase: "engarde" | "fight" | "touch" = "engarde";
  private phaseT = 0;
  private crowd: { g: THREE.Object3D; ph: number }[] = [];
  private cheer = 0;
  private hurried = false;
  lastToucher = -1;
  private tipT = 0;

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#3a2a4a", "#7a5a6a"], size: 9, sun: [0.25, 1, 0.6], sunColor: "#fff0d8", sunIntensity: 2.3, hemi: ["#fff4e0", "#6a5040", 1.4], fog: null });
    this.buildHall();
    this.players.forEach((p, i) => {
      const sd = i === 0 ? -1 : 1;
      const a = this.spawn(i, sd * START_X, 0, 0, { scale: SCALE });
      a.setRing(p.char.color);
      a.root.rotation.order = "YXZ";
      this.f.push({ x: sd * START_X, st: "guard", stT: 0, line: "low", act: "low", startedAt: 0, riposte: 0, score: 0, walk: 0, bufA: 0, bufB: 0, want: 2.8, wantT: 0, plan: 0, reacted: false });
      // the épée, in the hand on the camera's side
      const arm = i === 0 ? a.rig.armL : a.rig.armR;
      const sw = group(arm, { y: -0.3 });
      const bm = new THREE.MeshToonMaterial({ color: "#e8eef8", emissive: "#ffffff", emissiveIntensity: 0 });
      this.bladeMat.push(bm);
      const blade = cyl(sw, bm, 0.028, 1.15, { y: -0.68, seg: 6 });
      ball(sw, p.char.color, 0.06, { y: -1.27 });
      cone(sw, "#c8ccd8", 0.12, 0.1, { y: -0.08, rx: Math.PI });
      cyl(sw, "#3a3a46", 0.035, 0.18, { y: 0.05, seg: 6 });
      this.swords.push(sw);
      this.blades.push(blade);
    });
    this.hud.players(this.players, () => this.dots(0));
    this.hud.timer(TIME);
    this.setCam([0, 4, 12], [0, 1.1, 0], 36);
    this.place(0);
  }

  private dots(n: number) {
    let s = "";
    for (let k = 0; k < TARGET; k++) s += `<span style="color:${k < n ? "#ffd23f" : "rgba(255,255,255,.25)"};margin-right:.08em">●</span>`;
    return s;
  }
  private face(i: number) {
    return i === 0 ? 1 : -1;
  }

  // ------------------------------------------------------------ the hall

  private buildHall() {
    const s = this.scene;
    const marble = canvasTex(512, 512, (g, w, h) => {
      const n = 8;
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          g.fillStyle = (x + y) % 2 ? "#e8e0d4" : "#9a8a7e";
          g.fillRect((x * w) / n, (y * h) / n, w / n, h / n);
        }
      g.globalAlpha = 0.15;
      g.strokeStyle = "#fff";
      for (let k = 0; k < 30; k++) {
        g.beginPath();
        g.moveTo(Math.random() * w, Math.random() * h);
        g.bezierCurveTo(Math.random() * w, Math.random() * h, Math.random() * w, Math.random() * h, Math.random() * w, Math.random() * h);
        g.stroke();
      }
    }, true);
    marble.repeat.set(5, 3);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 24), new THREE.MeshToonMaterial({ map: marble }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);
    // the piste: a metal strip with its lines
    const pisteTex = canvasTex(1024, 128, (g, w, h) => {
      g.fillStyle = "#b8c0cc";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#9aa2b0";
      for (let k = 0; k < 60; k++) g.fillRect(Math.random() * w, Math.random() * h, 40, 2);
      const X = (x: number) => w / 2 + (x / (PISTE + 1)) * (w / 2);
      g.fillStyle = "#ffffff";
      g.fillRect(X(0) - 3, 0, 6, h);
      for (const sx of [-1, 1]) {
        g.fillRect(X(sx * START_X) - 2, 8, 4, h - 16);
        g.fillStyle = "#e84a3a";
        g.fillRect(sx > 0 ? X(PISTE - 0.4) : X(-PISTE - 1), 0, X(PISTE - 0.4) - X(PISTE - 1.4) + (sx > 0 ? 200 : 0), h);
        g.fillStyle = "#ffffff";
      }
      g.strokeStyle = "#5a6270";
      g.lineWidth = 6;
      g.strokeRect(3, 3, w - 6, h - 6);
    });
    const piste = new THREE.Mesh(new THREE.BoxGeometry((PISTE + 1) * 2, 0.06, 1.8), [toon("#8a92a0"), toon("#8a92a0"), new THREE.MeshToonMaterial({ map: pisteTex }), toon("#8a92a0"), toon("#8a92a0"), toon("#8a92a0")]);
    piste.position.y = 0.03;
    piste.receiveShadow = true;
    s.add(piste);
    // the back wall: arched windows, columns, banners
    const wall = new THREE.Mesh(GEO.plane, toon("#efe2cc"));
    wall.scale.set(40, 12, 1);
    wall.position.set(0, 6, -7);
    s.add(wall);
    box(s, "#c8b490", 40, 0.6, 0.4, { y: 0.3, z: -6.8 });
    box(s, "#c8b490", 40, 0.5, 0.5, { y: 7.6, z: -6.8 });
    const winTex = canvasTex(128, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, "#bfe4ff");
      gr.addColorStop(1, "#fff6d8");
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(0, h);
      g.lineTo(0, w / 2);
      g.arc(w / 2, w / 2, w / 2, Math.PI, 0);
      g.lineTo(w, h);
      g.fill();
      g.strokeStyle = "#7a6a50";
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(w / 2, 0);
      g.lineTo(w / 2, h);
      for (let y = w / 2; y < h; y += 46) {
        g.moveTo(0, y);
        g.lineTo(w, y);
      }
      g.stroke();
    });
    const winMat = new THREE.MeshBasicMaterial({ map: winTex, transparent: true });
    for (let k = -3; k <= 3; k++) {
      const x = k * 4.4;
      const wnd = new THREE.Mesh(GEO.plane, winMat);
      wnd.scale.set(1.8, 3.6, 1);
      wnd.position.set(x, 4.2, -6.95);
      s.add(wnd);
      // columns between windows
      const cx = x + 2.2;
      cyl(s, "#f4ead8", 0.32, 7.2, { x: cx, y: 3.9, z: -6.5, seg: 14 });
      box(s, "#d8c8a8", 0.9, 0.3, 0.9, { x: cx, y: 0.15, z: -6.5 });
      box(s, "#d8c8a8", 0.9, 0.3, 0.9, { x: cx, y: 7.5, z: -6.5 });
    }
    const bannerTex = (col: string) =>
      canvasTex(128, 320, (g, w, h) => {
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(w, 0);
        g.lineTo(w, h);
        g.lineTo(w / 2, h - 40);
        g.lineTo(0, h);
        g.fill();
        g.strokeStyle = "#ffd25a";
        g.lineWidth = 8;
        g.strokeRect(10, 10, w - 20, h - 70);
        // two crossed blades
        g.lineWidth = 7;
        g.beginPath();
        g.moveTo(30, 90);
        g.lineTo(98, 200);
        g.moveTo(98, 90);
        g.lineTo(30, 200);
        g.stroke();
        g.fillStyle = "#ffd25a";
        g.beginPath();
        g.arc(64, 145, 14, 0, Math.PI * 2);
        g.fill();
      });
    const bans = [new THREE.MeshToonMaterial({ map: bannerTex(this.players[0].char.color), transparent: true, side: THREE.DoubleSide }), new THREE.MeshToonMaterial({ map: bannerTex(this.players[1].char.color), transparent: true, side: THREE.DoubleSide })];
    for (const [x, k] of [
      [-6.6, 0],
      [-2.2 - 4.4 * 2, 0],
      [6.6, 1],
      [2.2 + 4.4 * 2, 1],
    ] as const) {
      const b = new THREE.Mesh(GEO.plane, bans[k]);
      b.scale.set(1.1, 2.7, 1);
      b.position.set(x, 3.5, -6.1);
      s.add(b);
    }
    // chandeliers
    for (const x of [-5, 5]) {
      const c = group(s, { x, y: 6.4, z: -2.5 });
      cyl(c, "#3a3020", 0.02, 1.6, { y: 0.8, seg: 4 });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.05, 6, 24), toon("#c8a040"));
      ring.rotation.x = Math.PI / 2;
      c.add(ring);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        cyl(c, "#fff8e8", 0.04, 0.2, { x: Math.cos(a) * 0.7, z: Math.sin(a) * 0.7, y: 0.12, seg: 6 });
        const fl = ball(c, toon("#ffe08a", "#ffb030", 1.5), 0.05, { x: Math.cos(a) * 0.7, z: Math.sin(a) * 0.7, y: 0.28 });
        fl.castShadow = false;
      }
    }
    // the scoring box with its two lamps
    const sb = group(s, { y: 0, z: -3.6 });
    cyl(sb, "#3a3a46", 0.06, 1.8, { y: 0.9, seg: 8 });
    box(sb, "#24242e", 2.4, 0.9, 0.4, { y: 2.1 });
    box(sb, "#3a3a46", 2.5, 0.08, 0.45, { y: 2.58 });
    for (const k of [0, 1]) {
      const m = new THREE.MeshToonMaterial({ color: "#555560", emissive: this.players[k].char.color, emissiveIntensity: 0 });
      this.lampMat.push(m);
      const l = new THREE.Mesh(GEO.sphere, m);
      l.scale.set(0.32, 0.32, 0.12);
      l.position.set(k === 0 ? -0.6 : 0.6, 2.1, 0.22);
      sb.add(l);
      this.lamps.push(l);
    }
    // the audience on benches along the wall
    const shirts = ["#c0504a", "#4a7ac0", "#e0b040", "#5aa060", "#9a6ac0", "#e08040", "#e8e0d0", "#3a3a4a"];
    const skins = ["#ffd2b0", "#e8b48a", "#c98d62", "#8a5a3a"];
    for (const sx of [-1, 1]) {
      box(s, "#7a4a28", 7, 0.45, 0.8, { x: sx * 7.6, y: 0.22, z: -4.8 });
      for (let k = 0; k < 6; k++) {
        const g = group(s, { x: sx * (5 + k * 1.05), y: 0.45, z: -4.8 });
        const body = new THREE.Mesh(GEO.capsule, toon(shirts[(k + (sx > 0 ? 3 : 0)) % shirts.length]));
        body.scale.set(0.55, 0.55, 0.45);
        body.position.y = 0.5;
        body.castShadow = true;
        g.add(body);
        ball(g, skins[(k + 1) % 4], 0.24, { y: 1.05, lo: true });
        this.crowd.push({ g, ph: Math.random() * 6 });
      }
    }
    // a red carpet under the piste ends
    for (const sx of [-1, 1]) {
      const c = new THREE.Mesh(GEO.plane, toon("#a8283a"));
      c.rotation.x = -Math.PI / 2;
      c.scale.set(3.4, 3, 1);
      c.position.set(sx * 9.2, 0.01, 0);
      s.add(c);
    }
  }

  // ------------------------------------------------------------ CPUs

  protected cpu(i: number, dt: number): CpuPad {
    if (this.phase !== "fight") return {};
    const me = this.f[i];
    const o = this.f[1 - i];
    const lv = this.players[i].level;
    const fc = this.face(i);
    const dist = Math.abs(o.x - me.x);
    // a riposte: the opponent is open
    if (o.st === "open" && me.st === "guard" && this.cpuAfter(i, "riposte", 0.25 - 0.2 * lv)) {
      this.cpuReset(i, "riposte");
      if (dist <= REACH + LUNGE_D + 0.15) return { a: true, y: Math.random() < 0.5 ? -1 : 0.4, x: fc * 0.3 };
      return { x: fc };
    }
    if (o.st !== "open") this.cpuReset(i, "riposte");
    // react to an attack: parry (reading the line), or step back
    if ((o.st === "windup" || o.st === "lunge") && me.st === "guard") {
      if (!me.reacted) {
        me.reacted = true;
        const delay = 0.2 - 0.12 * lv + Math.random() * 0.08;
        me.plan = this.t + delay;
        me.act = Math.random() < 0.45 + 0.45 * lv ? o.act : o.act === "high" ? "low" : "high";
        me.wantT = Math.random() < 0.3 + 0.45 * lv ? 1 : Math.random() < 0.5 ? 2 : 0; // 1: parry, 2: retreat, 0: freeze
      }
      if (me.wantT === 1 && this.t >= me.plan) return { b: true, y: me.act === "high" ? -1 : 0.4 };
      if (me.wantT === 2 && this.t >= me.plan) return { x: -fc };
      return { y: me.line === "high" ? -1 : 0.4 };
    }
    if (o.st === "guard" || o.st === "recover" || o.st === "parryCd") me.reacted = false;
    if (me.st !== "guard") return { y: me.act === "high" ? -1 : 0.4 };
    // footwork: hover around a wanted distance, change it now and then
    me.wantT -= dt;
    if (me.wantT <= 0) {
      me.want = 2.2 + Math.random() * 1.2;
      me.wantT = 0.6 + Math.random() * 1.2;
      me.line = Math.random() < 0.5 ? "high" : "low";
    }
    let x = clamp((dist - me.want) * 2, -1, 1) * fc;
    // attack when in range: more often when the opponent is busy
    const inRange = dist <= REACH + LUNGE_D - 0.05;
    const busy = o.st === "recover" || o.st === "parryCd";
    if (inRange && Math.random() < (busy ? 3.5 + 3 * lv : 0.5 + 0.9 * lv) * dt) return { a: true, y: me.line === "high" ? -1 : 0.4, x };
    if (Math.abs(x) < 0.25) x = 0;
    return { x, y: me.line === "high" ? -1 : 0.4 };
  }

  // ------------------------------------------------------------ the bout

  start() {
    this.phase = "engarde";
    this.phaseT = 0;
    this.hud.banner(T("EN GARDE!", "预备！"), { size: 7, ms: 800 });
    this.tipT = 6;
    this.hud.tip(T(`Stick <b>↑</b> high line · <b>↓</b> low line · <span class="key a">A</span> lunge · <span class="key b">B</span> parry`, `摇杆 <b>↑</b> 高位 · <b>↓</b> 低位 · <span class="key a">A</span> 弓步刺 · <span class="key b">B</span> 格挡`));
  }

  protected idle(dt: number) {
    this.moveCam([0, 2.5, 9], [0, 1.15, 0], dt, 1.5);
    this.place(dt);
    this.animateCrowd(dt);
  }

  protected step(dt: number) {
    const left = TIME - this.t;
    this.hud.timer(left);
    this.phaseT += dt;
    if (this.tipT > 0) {
      this.tipT -= dt;
      if (this.tipT <= 0) this.hud.tip(null);
    }
    if (!this.hurried && left <= 10) {
      this.hurried = true;
      this.hud.banner(T("10 SECONDS LEFT!", "还剩 10 秒！"), { color: "#ffd23f", size: 6 });
      music.speed(1.15);
      this.sound("bell");
    }
    if (this.phase === "engarde") {
      if (this.phaseT > 0.9) {
        this.phase = "fight";
        this.phaseT = 0;
        this.hud.banner(T("FENCE!", "开始！"), { color: "#ffd23f", size: 7, ms: 600 });
        this.sound("whistle");
      }
    } else if (this.phase === "touch") {
      // the freeze, then back to the lines
      if (this.phaseT > 1.6) {
        if (this.f[0].score >= TARGET || this.f[1].score >= TARGET) {
          this.finishByScore(this.f.map((f) => f.score));
          return;
        }
        this.resetBout();
      }
    } else this.fight(dt);
    if (left <= 0 && this.phase !== "touch") this.finishByScore(this.f.map((f) => f.score));
    this.place(dt);
    this.animateCrowd(dt);
    const mid = (this.f[0].x + this.f[1].x) / 2;
    const gap = Math.abs(this.f[1].x - this.f[0].x);
    const zoom = this.phase === "touch" ? 0.75 : 1;
    this.moveCam([mid * 0.6, 2.5, (7.2 + gap * 0.4) * zoom], [mid * 0.7, 1.15, 0], dt, this.phase === "touch" ? 4 : 2.5);
  }

  private resetBout() {
    this.f.forEach((f, i) => {
      f.x = (i === 0 ? -1 : 1) * START_X;
      f.st = "guard";
      f.stT = 0;
      f.riposte = 0;
      f.reacted = false;
      f.bufA = f.bufB = 0;
    });
    this.lampMat.forEach((m) => (m.emissiveIntensity = 0));
    this.phase = "engarde";
    this.phaseT = 0;
    this.hud.banner(T("EN GARDE!", "预备！"), { size: 7, ms: 800 });
    this.sound("swing");
  }

  private fight(dt: number) {
    this.f.forEach((f, i) => {
      const pad = this.pad(i);
      const fc = this.face(i);
      f.stT += dt;
      f.riposte = Math.max(0, f.riposte - dt);
      const want: Line = pad.y < -0.4 ? "high" : "low";
      f.walk = 0;
      // a press slightly before being ready still counts
      f.bufA = pad.aDown ? 0.15 : Math.max(0, f.bufA - dt);
      f.bufB = pad.bDown ? 0.15 : Math.max(0, f.bufB - dt);
      switch (f.st) {
        case "guard": {
          f.line = want;
          const mv = Math.abs(pad.x) > 0.25 ? Math.sign(pad.x) * Math.min(1, Math.abs(pad.x) * 1.3) : 0;
          f.x += mv * WALK * dt;
          f.walk = mv * fc;
          if (f.bufA > 0) {
            f.bufA = 0;
            f.st = "windup";
            f.stT = 0;
            f.act = want;
            f.startedAt = this.t;
            this.sound("swing");
          } else if (f.bufB > 0) {
            f.bufB = 0;
            f.st = "parry";
            f.stT = 0;
            f.act = want;
            this.sound("whoosh");
          }
          break;
        }
        case "windup":
          if (f.stT >= (f.riposte > 0 ? 0.06 : WINDUP)) {
            f.st = "lunge";
            f.stT = 0;
            this.sound("whoosh");
          }
          break;
        case "lunge":
          f.x += fc * (LUNGE_D / LUNGE_T) * dt;
          if (f.stT >= LUNGE_T) this.strike(i);
          break;
        case "recover":
          f.x -= fc * (LUNGE_D * 0.55 / RECOVER) * dt;
          if (f.stT >= RECOVER) this.toGuard(f);
          break;
        case "parry":
          if (f.stT >= PARRY_T) {
            f.st = "parryCd";
            f.stT = 0;
          }
          break;
        case "parryCd":
          if (f.stT >= PARRY_CD) this.toGuard(f);
          break;
        case "open":
          f.x -= fc * 0.6 * dt;
          if (f.stT >= OPEN_T) this.toGuard(f);
          break;
      }
    });
    // keep them on the piste and apart
    const [a, b] = this.f;
    a.x = clamp(a.x, -PISTE, PISTE);
    b.x = clamp(b.x, -PISTE, PISTE);
    if (b.x - a.x < 1.4) {
      const m = (a.x + b.x) / 2;
      a.x = m - 0.7;
      b.x = m + 0.7;
    }
  }

  private toGuard(f: Fencer) {
    f.st = "guard";
    f.stT = 0;
    f.reacted = false;
  }

  /** The end of a lunge: a touch, a parry, or nothing. */
  private strike(i: number) {
    const f = this.f[i];
    const o = this.f[1 - i];
    f.st = "recover";
    f.stT = 0;
    const dist = Math.abs(o.x - f.x);
    if (dist > REACH) {
      this.sound("swing");
      return;
    }
    // the other one is lunging too and started first: they have the right of way
    if ((o.st === "lunge" || o.st === "windup") && o.startedAt < f.startedAt - 0.02) return;
    const unparriable = f.riposte > 0;
    if (o.st === "parry" && o.act === f.act && !unparriable) {
      // parried! the attacker is open
      f.st = "open";
      f.stT = 0;
      o.riposte = OPEN_T + 0.1;
      o.st = "guard";
      o.stT = 0;
      this.sound("ding");
      this.sound("hit");
      this.shake = 0.15;
      this.buzz(1 - i, 50);
      const tip = new THREE.Vector3((f.x + o.x) / 2, f.act === "high" ? 1.75 : 1.1, 0.3);
      this.fx.burst(tip, { count: 18, colors: ["#ffffff", "#ffe14a", "#bfe8ff"], speed: 5, size: 0.06, life: 0.35, shape: "ball" });
      this.hud.pop(tip.clone().add(new THREE.Vector3(0, 0.6, 0)), T("PARRY!", "格挡！"), "#9fe8ff", this.camera);
      this.bladeMat[1 - i].emissiveIntensity = 1;
      return;
    }
    this.touch(i);
  }

  private touch(i: number) {
    const f = this.f[i];
    const o = this.f[1 - i];
    f.score++;
    this.lastToucher = i;
    this.hud.setScore(this.players[i].seat, this.dots(f.score));
    this.lampMat[i].emissiveIntensity = 1.6;
    this.lampMat[i].color.set(this.players[i].char.color);
    this.phase = "touch";
    this.phaseT = 0;
    this.freeze = 0.5;
    o.st = "touched";
    o.stT = 0;
    const at = new THREE.Vector3(o.x - this.face(i) * 0.2, f.act === "high" ? 1.6 : 1.0, 0.2);
    this.fx.burst(at, { count: 26, colors: ["#ffffff", "#ffe14a", this.players[i].char.color], speed: 6, size: 0.09, life: 0.5, shape: "ball" });
    this.fx.ring(at, "#ffffff", 1.2, 0.35);
    this.avatars[1 - i].flash();
    this.sound("buzzer");
    this.sound("cheer");
    this.shake = 0.35;
    this.cheer = 1;
    this.buzz(i, 80);
    this.buzz(1 - i, [80, 50, 80]);
    const last = f.score >= TARGET;
    const who = this.players[i].name,
      n = f.score;
    this.hud.banner(T("TOUCH!", "击中！"), { color: this.players[i].char.color, size: 10, ms: 1200, sub: last ? T(`${who} wins the bout!`, `${who} 赢下比赛！`) : T(`${who}: ${n} touch${n === 1 ? "" : "es"}`, `${who}：击中 ${n} 次`) });
  }

  // ------------------------------------------------------------ drawing

  private place(dt: number) {
    this.players.forEach((_, i) => {
      const a = this.avatars[i];
      const f = this.f[i];
      const fc = this.face(i);
      a.pos.x = f.x;
      a.pos.z = 0;
      a.yaw = fc > 0 ? Math.PI / 2 - 0.32 : -Math.PI / 2 + 0.32;
      if (this.finished) return;
      if (f.st === "touched") a.anim = "hit";
      else if (Math.abs(f.walk) > 0.1) {
        a.anim = "run";
        a.speed = 0.25;
      } else a.anim = "idle";
      const lean = f.st === "lunge" || (f.st === "recover" && f.stT < 0.15) ? 0.32 : f.st === "windup" ? -0.08 : f.st === "open" ? -0.25 : 0.05;
      a.root.rotation.x = damp(a.root.rotation.x, lean, 18, dt);
      a.pos.y = f.st === "lunge" || f.st === "recover" ? -0.06 : 0;
      this.bladeMat[i].emissiveIntensity = Math.max(f.riposte > 0 ? 0.5 + 0.5 * Math.sin(this.t * 20) : 0, this.bladeMat[i].emissiveIntensity - dt * 3);
    });
  }

  /** After the avatars' own animation: the fencing poses. */
  private rig() {
    this.players.forEach((_, i) => {
      const a = this.avatars[i];
      const f = this.f[i];
      if (this.finished || f.st === "touched") return;
      const r = a.rig;
      const sword = i === 0 ? r.armL : r.armR;
      const off = i === 0 ? r.armR : r.armL;
      const side = i === 0 ? -1 : 1; // the sword arm's side in the avatar's frame
      const ln = f.st === "guard" ? f.line : f.act;
      let ax = ln === "high" ? -1.95 : -1.15;
      if (f.st === "windup") ax += 0.55;
      if (f.st === "lunge") ax = ln === "high" ? -1.75 : -1.35;
      if (f.st === "parry") ax = ln === "high" ? -2.5 : -0.75;
      if (f.st === "open") ax = -0.4;
      sword.rotation.x = ax;
      sword.rotation.z = side * (f.st === "parry" ? 0.55 : 0.12);
      off.rotation.x = 0.4;
      off.rotation.z = -side * (f.st === "lunge" ? 1.2 : 2.3);
      // the fencing stance: front leg forward, back leg behind
      const lunge = f.st === "lunge" || (f.st === "recover" && f.stT < 0.2);
      const step = Math.abs(f.walk) > 0.1 ? Math.sin(this.t * 14) * 0.25 : 0;
      r.legL.rotation.x = (lunge ? -1.25 : -0.45) + step;
      r.legR.rotation.x = (lunge ? 0.75 : 0.4) - step;
      r.head.rotation.x = -0.1;
    });
  }

  update(dt: number) {
    // the touch freeze: the world slows down a moment
    if (this.freeze > 0) {
      this.freeze -= dt;
      dt *= 0.25;
    }
    super.update(dt);
    this.rig();
  }
  preview(dt: number) {
    super.preview(dt);
    this.rig();
  }
  private animateCrowd(dt: number) {
    this.cheer = Math.max(0, this.cheer - dt * 0.5);
    for (const c of this.crowd) {
      c.ph += dt * (3 + 8 * this.cheer);
      c.g.position.y = 0.45 + Math.abs(Math.sin(c.ph)) * (0.02 + 0.25 * this.cheer);
    }
  }

  protected celebrate(res: MiniResult) {
    this.avatars.forEach((a, i) => {
      a.root.rotation.x = 0;
      a.anim = res.place[i] === 1 && res.place[1 - i] !== 1 ? "win" : "lose";
    });
  }

  protected outroStep(dt: number) {
    this.animateCrowd(dt);
    this.avatars.forEach((a, i) => a.face(i === 0 ? 0.6 : -0.6, dt, 4));
    this.moveCam([0, 2.4, 7.4], [0, 1.15, 0], dt, 1.5);
  }
}

const def: MiniDef = {
  id: "escrime",
  name: "Fencing",
  icon: "🤺",
  color: "#c0c8d8",
  tagline: "Attack, parry, touch!",
  rules: "Stick: step in and out. A: lunge (stick up = high line, else low). B: parry in the stick's line; a parry leaves the attacker open. First to 3 touches!",
  controls: { stick: "Step in / out · high or low line", a: "Lunge", b: "Parry" },
  modes: ["duel"],
  length: 45,
  music: "tense",
  create: (ctx) => new Escrime(ctx),
};
export default def;
