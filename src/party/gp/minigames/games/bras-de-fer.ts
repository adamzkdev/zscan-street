/**
 * ARM WRESTLE (duel, 20 s): arm wrestling on a table of the "Proof of Work" tavern, the regulars
 * cheering around. Mash A to push. Every few seconds a "POWER!" ring closes in: B right when it
 * closes gives a big push. Pin the other one's hand to the table to win; after 20 s, the side the
 * hands lean to wins.
 */
import * as THREE from "three";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef, MiniResult } from "../types";
import { GEO, ball, box, canvasTex, cone, cyl, flat, group, toon } from "../../engine/gfx";
import { clamp, damp } from "../../engine/util";
import { music } from "../../engine/audio";
import { T } from "../../../../i18n/lang";

const TIME = 20;
/** Gauge speed per press/s of difference. */
const K = 0.042;
const TAU = 0.7;
const LEAD = 1.05;
const PERFECT = 0.085;
const GOOD = 0.2;
const PUSH_PERFECT = 0.24;
const PUSH_GOOD = 0.12;
/** Table top height, forearm length, max angle (hand on the table). */
const TY = 0.84;
const FORE = 0.56;
const MAXA = 1.42;
const SEAT_X = 1.22;
const SCALE = 1.15;

interface Wrestler {
  acc: number;
  rate: number;
  jolt: number;
  slip: number;
  tried: boolean;
  grade: number;
  cpuAt: number;
  cpuPlanned: boolean;
  cpuPh: number;
  /** CPU effort waves (each one tires and pushes at its own rhythm). */
  cpuF: number;
  cpuPh0: number;
  /** The wrestling arm: the zkSNARK's own sleeve and hand, stretched from its shoulder to the grip (rig()). */
  arm: { upper: Seg; fore: Seg; hand: Seg };
}

/** A part of the arm: a copy of the zkSNARK's own limb (its sleeve's colour, its ink) in a group posed each frame. */
interface Seg {
  g: THREE.Group;
  /** The limb's own length (its box's height). */
  h: number;
}

class BrasDeFer extends BaseMini {
  private w: Wrestler[] = [];
  /** -1 … 1: > 0 = player 0 is winning (the hands lean toward player 1). */
  private p = 0;
  private vel = 0;
  private pending = 0;
  private prompt: { beat: number; hit: boolean } | null = null;
  private nextBeat = 3;
  private hurried = false;
  private crowd: { g: THREE.Object3D; ph: number; y0: number }[] = [];
  private mugs: { m: THREE.Object3D; y0: number; vy: number; y: number }[] = [];
  private fire!: THREE.PointLight;
  private flames: THREE.Mesh[] = [];
  private gaugeMark!: HTMLElement;
  private gaugeBar!: HTMLElement;
  private promptEl!: HTMLElement;
  private promptRing!: HTMLElement;
  private promptCore!: HTMLElement;
  private promptTxt!: HTMLElement;
  private bars: HTMLElement[] = [];
  private cheer = 0;
  private winner: number | null = null;
  private slammed = false;
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private inv = new THREE.Matrix4();
  private mw = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private sv = new THREE.Vector3();

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#2a1a12", "#5a3a24"], size: 8, sun: [0.3, 1, 0.8], sunColor: "#ffe2b8", sunIntensity: 2.0, hemi: ["#ffe0b0", "#5a3a20", 1.3], fog: null });
    this.buildTavern();
    this.players.forEach((_, i) => {
      const sd = i === 0 ? -1 : 1;
      const a = this.spawn(i, sd * SEAT_X, 0.1, sd < 0 ? Math.PI / 2 - 0.62 : -Math.PI / 2 + 0.62, { scale: SCALE });
      a.pos.y = 0.3;
      a.root.rotation.order = "YXZ";
      a.anim = "sit";
      // (its own arm hides; a longer copy of it, under the body so that the intro carries it, reaches the grip)
      const sh = a.rig.armR;
      sh.visible = false;
      const el = sh.children[1];
      const mk = (src: THREE.Object3D | undefined): Seg => {
        const g = new THREE.Group();
        g.matrixAutoUpdate = false;
        a.snark.root.add(g);
        if (!(src instanceof THREE.Mesh)) return { g, h: 1 };
        const m = src.clone();
        m.position.set(0, 0, 0);
        g.add(m);
        return { g, h: src.scale.y };
      };
      const arm = { upper: mk(sh.children[0]), fore: mk(el?.children[0]), hand: mk(el?.children[1]) };
      this.w.push({ acc: 0, rate: 0, jolt: 0, slip: 0, tried: false, grade: 0, cpuAt: Infinity, cpuPlanned: false, cpuPh: Math.random(), cpuF: 0.6 + Math.random() * 0.5, cpuPh0: Math.random() * 6.3, arm });
    });
    const cards = this.hud.players(this.players, () => "");
    [...cards.children].forEach((c, i) => {
      const v = c.querySelector(".val") as HTMLElement;
      v.innerHTML = `<div style="width:calc(var(--u)*8);height:calc(var(--u)*1.3);margin-top:calc(var(--u)*0.4);border-radius:999px;background:rgba(255,255,255,.18);overflow:hidden"><div style="height:100%;width:0;border-radius:999px;background:${this.players[i].char.color}"></div></div>`;
      this.bars.push(v.firstElementChild!.firstElementChild as HTMLElement);
    });
    this.buildHud();
    this.hud.timer(TIME);
    this.setCam([0, 3.6, 7.5], [0, 1.1, 0], 38);
  }

  // ------------------------------------------------------------ the tavern

  private buildTavern() {
    const s = this.scene;
    const planks = (base: string, line: string, vertical: boolean) =>
      canvasTex(512, 512, (g, w, h) => {
        g.fillStyle = base;
        g.fillRect(0, 0, w, h);
        g.strokeStyle = line;
        g.lineWidth = 5;
        for (let k = 0; k <= 8; k++) {
          g.beginPath();
          if (vertical) {
            g.moveTo((k * w) / 8, 0);
            g.lineTo((k * w) / 8, h);
          } else {
            g.moveTo(0, (k * h) / 8);
            g.lineTo(w, (k * h) / 8);
          }
          g.stroke();
        }
        g.globalAlpha = 0.18;
        for (let k = 0; k < 80; k++) {
          g.fillStyle = k % 2 ? "#000" : "#fff";
          g.fillRect(Math.random() * w, Math.random() * h, vertical ? 3 : 30 + Math.random() * 40, vertical ? 30 + Math.random() * 40 : 3);
        }
      }, true);
    const floorTex = planks("#8a5a34", "#5a3a20", false);
    floorTex.repeat.set(4, 4);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 16), new THREE.MeshToonMaterial({ map: floorTex }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);
    const wallTex = planks("#a0683a", "#6a4024", true);
    wallTex.repeat.set(6, 1);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(24, 7), new THREE.MeshToonMaterial({ map: wallTex }));
    wall.position.set(0, 3.5, -4.2);
    wall.receiveShadow = true;
    s.add(wall);
    for (const sx of [-1, 1]) {
      const sw = new THREE.Mesh(new THREE.PlaneGeometry(16, 7), new THREE.MeshToonMaterial({ map: wallTex }));
      sw.position.set(sx * 7, 3.5, 2);
      sw.rotation.y = -sx * Math.PI / 2;
      s.add(sw);
    }
    // beams
    for (const x of [-5, -1.7, 1.7, 5]) box(s, "#5a361c", 0.3, 7, 0.3, { x, y: 3.5, z: -4.05 });
    box(s, "#5a361c", 24, 0.35, 0.35, { y: 4.6, z: -4.0 });
    // the fireplace (left) with a flickering fire
    const fp = group(s, { x: -3.4, z: -3.9 });
    const stone = toon("#9a948c");
    box(fp, stone, 2.4, 2.4, 0.6, { y: 1.2 });
    box(fp, "#2a1a14", 1.5, 1.3, 0.2, { y: 0.75, z: 0.25 });
    box(fp, "#6a6460", 2.8, 0.25, 0.8, { y: 2.5 });
    for (let k = 0; k < 3; k++) {
      const f = cone(fp, flat(k === 1 ? "#ffd23f" : "#ff7a2e"), 0.22 - k * 0.03, 0.7, { x: -0.35 + k * 0.35, y: 0.5, z: 0.35, cast: false });
      this.flames.push(f);
    }
    for (let k = 0; k < 2; k++) cyl(fp, "#5a3418", 0.08, 1.0, { y: 0.2, z: 0.35, rz: Math.PI / 2 + (k ? 0.3 : -0.3) });
    this.fire = new THREE.PointLight("#ff9a4a", 6, 9, 1.6);
    this.fire.position.set(-3.4, 1.2, -3);
    s.add(this.fire);
    // barrels and shelves (right)
    const barrel = (x: number, y: number, z: number, lying = false) => {
      const g = group(s, { x, y, z, rz: lying ? Math.PI / 2 : 0 });
      cyl(g, "#8a5428", 0.45, 1.0, { seg: 14 });
      for (const yy of [-0.35, 0.35]) cyl(g, "#3a3a42", 0.47, 0.06, { y: yy, seg: 14 });
    };
    barrel(3.6, 0.5, -3.4);
    barrel(4.6, 0.5, -3.3);
    barrel(4.1, 1.42, -3.35, true);
    barrel(-5.2, 0.5, -2.2);
    const shelf = group(s, { x: 1.2, z: -4.05 });
    for (const y of [2.1, 2.9]) {
      box(shelf, "#5a361c", 2.2, 0.08, 0.35, { y, z: 0.15 });
      const cols = ["#3fae4a", "#c83a3a", "#e8c050", "#4a7ad0", "#8a4ab0"];
      for (let k = 0; k < 6; k++) {
        const c = cols[(k + (y > 2.5 ? 2 : 0)) % 5];
        cyl(shelf, toon(c, c, 0.15), 0.08, 0.36, { x: -0.9 + k * 0.36, y: y + 0.22, z: 0.15, seg: 8 });
      }
    }
    // a sign and lanterns
    const sign = canvasTex(512, 160, (g, w, h) => {
      g.fillStyle = "#3a2010";
      g.beginPath();
      g.roundRect(4, 4, w - 8, h - 8, 26);
      g.fill();
      g.strokeStyle = "#e8b04a";
      g.lineWidth = 8;
      g.stroke();
      g.fillStyle = "#ffd37a";
      const name = "PROOF OF WORK";
      let px = 70;
      g.font = `800 ${px}px Geist, Roboto, sans-serif`;
      while (px > 36 && g.measureText(name).width > w - 60) g.font = `800 ${(px -= 2)}px Geist, Roboto, sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(name, w / 2, h / 2 + 4);
    });
    const sg = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: sign, transparent: true }));
    sg.scale.set(3.2, 1, 1);
    sg.position.set(1.2, 3.9, -4.1);
    s.add(sg);
    for (const x of [-1.6, 1.8]) {
      cyl(s, "#2a2a30", 0.015, 0.8, { x, y: 4.1, z: -1, seg: 4 });
      const l = ball(s, toon("#ffe08a", "#ffb030", 1.2), 0.16, { x, y: 3.6, z: -1 });
      l.castShadow = false;
    }
    // the table and the stools
    const tg = group(s);
    box(tg, "#a8703e", 1.7, 0.12, 1.1, { y: TY - 0.06 });
    box(tg, "#8a5a30", 1.78, 0.06, 1.18, { y: TY - 0.15 });
    for (const [x, z] of [
      [-0.7, -0.42],
      [0.7, -0.42],
      [-0.7, 0.42],
      [0.7, 0.42],
    ])
      box(tg, "#6a4224", 0.12, TY - 0.15, 0.12, { x, z, y: (TY - 0.15) / 2 });
    // the centre line and the two pads where the hand must be pinned
    box(tg, flat("#3a2010"), 0.03, 0.005, 1.0, { y: TY + 0.003, cast: false });
    for (const [x, c] of [
      [-0.62, this.players[1].char.color],
      [0.62, this.players[0].char.color],
    ] as const) {
      const pad = new THREE.Mesh(GEO.circle, toon(c));
      pad.rotation.x = -Math.PI / 2;
      pad.scale.setScalar(0.17);
      pad.position.set(x, TY + 0.004, 0);
      tg.add(pad);
    }
    for (const sx of [-1, 1]) {
      const st = group(s, { x: sx * (SEAT_X + 0.05), z: 0 });
      cyl(st, "#7a4a28", 0.34, 0.1, { y: 0.52, seg: 16 });
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        cyl(st, "#5a361c", 0.04, 0.52, { x: Math.cos(a) * 0.22, z: Math.sin(a) * 0.22, y: 0.26, seg: 6 });
      }
    }
    // mugs on the table (they jump at each big push)
    for (const [x, z] of [
      [-0.55, 0.38],
      [0.58, -0.36],
      [0.5, 0.4],
    ]) {
      const m = group(tg, { x, y: TY, z });
      cyl(m, "#c8a060", 0.09, 0.22, { y: 0.11, seg: 10 });
      cyl(m, "#fff8e0", 0.085, 0.05, { y: 0.24, seg: 10 });
      const h = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.015, 6, 10), toon("#c8a060"));
      h.position.set(0.1, 0.12, 0);
      m.add(h);
      this.mugs.push({ m, y0: TY, vy: 0, y: TY });
    }
    // the regulars, cheering behind the table
    const shirts = ["#c0504a", "#4a7ac0", "#e0b040", "#5aa060", "#9a6ac0", "#e08040", "#e8e0d0"];
    const skins = ["#ffd2b0", "#e8b48a", "#c98d62", "#8a5a3a"];
    for (let k = 0; k < 9; k++) {
      const x = -4 + k * 1.0 + (k % 2) * 0.2;
      if (Math.abs(x) < 0.5) continue;
      const z = -1.7 - (k % 3) * 0.55;
      const g = group(s, { x, z });
      const body = new THREE.Mesh(GEO.capsule, toon(shirts[k % shirts.length]));
      body.scale.set(0.62, 0.75, 0.5);
      body.position.y = 0.72;
      body.castShadow = true;
      g.add(body);
      ball(g, skins[k % 4], 0.26, { y: 1.45, lo: true });
      if (k % 2) {
        // raising a mug
        cyl(g, "#c8a060", 0.08, 0.2, { x: 0.36, y: 1.55, seg: 8 });
        ball(g, skins[k % 4], 0.08, { x: 0.36, y: 1.42, lo: true });
      } else for (const sx of [-1, 1]) ball(g, skins[k % 4], 0.08, { x: sx * 0.38, y: 1.6, lo: true });
      if (k % 3 === 0) cyl(g, "#4a3020", 0.25, 0.15, { y: 1.68, seg: 10 });
      this.crowd.push({ g, ph: Math.random() * 6, y0: 0 });
    }
  }

  private buildHud() {
    const u = (n: number) => `calc(var(--u)*${n})`;
    const [c0, c1] = this.players.map((p) => p.char.color);
    const box = this.hud.add(
      `<div class="bf-bar" style="position:absolute;left:50%;top:${u(8)};transform:translateX(-50%);width:${u(44)};height:${u(2.8)};border-radius:999px;border:${u(0.35)} solid #1d1630;background:linear-gradient(90deg,${c0} 0 50%,${c1} 50% 100%);box-shadow:0 ${u(0.4)} 0 rgba(0,0,0,.3)">
        <div style="position:absolute;left:50%;top:-${u(0.6)};bottom:-${u(0.6)};width:${u(0.3)};background:#fff;transform:translateX(-50%)"></div>
        <div class="bf-m" style="position:absolute;left:50%;top:50%;width:${u(4)};height:${u(4)};transform:translate(-50%,-50%);border-radius:50%;background:#fff;border:${u(0.35)} solid #1d1630;display:grid;place-items:center;font-size:${u(2.2)}">💪</div>
      </div>`,
    );
    this.gaugeMark = box.querySelector(".bf-m") as HTMLElement;
    this.gaugeBar = box.querySelector(".bf-bar") as HTMLElement;
    this.promptEl = this.hud.add(
      `<div style="position:absolute;left:50%;top:${u(44)};transform:translate(-50%,-50%);width:${u(9)};height:${u(9)}">
        <div class="pr-ring" style="position:absolute;inset:0;border-radius:50%;border:${u(0.7)} solid #fff;box-shadow:0 0 ${u(1)} rgba(255,255,255,.6)"></div>
        <div class="pr-core" style="position:absolute;inset:${u(1.6)};border-radius:50%;background:#ff4b3e;border:${u(0.45)} solid #1d1630;display:grid;place-items:center;font-family:var(--title);font-size:${u(3.6)};color:#fff;box-shadow:0 ${u(0.4)} 0 rgba(0,0,0,.35)">B</div>
        <div class="pr-txt" style="position:absolute;left:50%;bottom:100%;transform:translateX(-50%);margin-bottom:${u(0.4)};font-family:var(--title);font-size:${u(3)};white-space:nowrap;color:#fff;-webkit-text-stroke:${u(0.3)} #1d1630;paint-order:stroke fill">${T("GET READY", "准备")}</div>
      </div>`,
    ).firstElementChild as HTMLElement;
    this.promptRing = this.promptEl.querySelector(".pr-ring") as HTMLElement;
    this.promptCore = this.promptEl.querySelector(".pr-core") as HTMLElement;
    this.promptTxt = this.promptEl.querySelector(".pr-txt") as HTMLElement;
    this.promptEl.style.display = "none";
  }

  // ------------------------------------------------------------ CPUs

  protected cpu(i: number, dt: number): CpuPad {
    const me = this.w[i];
    const lv = this.players[i].level;
    const wave = 1 + 0.13 * Math.sin(this.t * me.cpuF + me.cpuPh0);
    const losing = (i === 0 ? -this.p : this.p) > 0.5 ? 1.08 : 1;
    me.cpuPh += (5.2 + 3.4 * lv) * wave * losing * dt;
    const a = me.cpuPh % 1 < 0.5;
    let b = false;
    if (this.prompt && !me.tried) {
      if (!me.cpuPlanned) {
        me.cpuPlanned = true;
        if (Math.random() >= 0.26 - 0.22 * lv) {
          const g = (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;
          me.cpuAt = this.prompt.beat + g * (0.19 - 0.14 * lv) + 0.01;
        } else me.cpuAt = Infinity;
      }
      if (this.t >= me.cpuAt) b = true;
    }
    return { a, b };
  }

  // ------------------------------------------------------------ the game

  protected idle(dt: number) {
    this.moveCam([0, 3.5, 5.0], [0, 0.85, 0], dt, 1.6);
    this.animateWorld(dt);
  }

  protected step(dt: number) {
    const left = TIME - this.t;
    this.hud.timer(left);
    if (!this.hurried && left <= 7) {
      this.hurried = true;
      this.hud.banner(T("FINAL PUSH!", "最后冲刺！"), { color: "#ffd23f", size: 6 });
      music.speed(1.18);
      this.sound("bell");
    }
    const decay = Math.exp(-dt / TAU);
    this.w.forEach((w, i) => {
      w.acc *= decay;
      if (this.pad(i).aDown) {
        w.acc += 1;
        w.jolt = 1;
      }
      w.rate = Math.min(13, w.acc / TAU);
      if (w.rate > 6.5 && Math.random() < dt * (w.rate - 5.5) * 0.7) {
        const a = this.avatars[i];
        this.fx.burst({ x: a.pos.x * 0.85, y: 2.0, z: 0.1 }, { count: 2, colors: ["#bfe8ff", "#ffffff"], speed: 1.2, up: 1.6, gravity: 9, size: 0.05, sizeEnd: 0.015, life: 0.5, shape: "ball" });
      }
      w.jolt = Math.max(0, w.jolt - dt * 6);
      w.slip = Math.max(0, w.slip - dt);
    });
    this.stepPrompt();
    // the defender digs in when close to losing
    const f = this.w.map((w, i) => {
      const losing = (i === 0 ? -this.p : this.p) > 0.7 ? 1.1 : 1;
      return w.rate * (w.slip > 0 ? 0.45 : 1) * losing;
    });
    const ramp = 1 + Math.max(0, this.t - 8) / 8;
    this.vel = damp(this.vel, (f[0] - f[1]) * K * ramp, 2.6, dt);
    const kick = this.pending * (1 - Math.exp(-8 * dt));
    this.pending -= kick;
    this.p = clamp(this.p + this.vel * dt + kick, -1, 1);
    this.cheer = damp(this.cheer, Math.min(1, Math.abs(this.vel) * 4 + Math.abs(this.p) * 0.6 + Math.abs(kick) * 30), 3, dt);
    // each one's colour is their ground: the border between them is where the hands are
    const X = 50 + this.p * 50;
    this.gaugeMark.style.left = `${X}%`;
    this.gaugeBar.style.background = `linear-gradient(90deg,${this.players[0].char.color} 0 ${X}%,${this.players[1].char.color} ${X}% 100%)`;
    this.w.forEach((w, i) => (this.bars[i].style.width = `${clamp(w.rate / 11, 0, 1) * 100}%`));
    this.moveCam([this.p * 0.3, 3.5 - Math.abs(this.p) * 0.3, 5.0 - Math.abs(this.p) * 0.8], [this.p * 0.2, 0.85, 0], dt, 2.5);
    this.animateWorld(dt);
    if (this.p >= 1) this.end(0);
    else if (this.p <= -1) this.end(1);
    else if (left <= 0) this.end(Math.abs(this.p) < 0.04 ? null : this.p > 0 ? 0 : 1);
  }

  private stepPrompt() {
    const t = this.t;
    if (!this.prompt && t >= this.nextBeat - LEAD) {
      this.prompt = { beat: this.nextBeat, hit: false };
      this.w.forEach((w) => {
        w.tried = false;
        w.grade = 0;
        w.cpuPlanned = false;
        w.cpuAt = Infinity;
      });
      this.promptEl.style.display = "";
      this.promptTxt.textContent = T("GET READY", "准备");
      this.promptCore.style.background = "#ff4b3e";
      this.sound("tick");
    }
    const pr = this.prompt;
    if (!pr) return;
    const k = (pr.beat - t) / LEAD;
    this.promptRing.style.transform = `scale(${Math.max(0.72, 1 + 1.8 * k)})`;
    this.promptRing.style.opacity = String(clamp(1.2 - Math.abs(k) * 0.4, 0, 1));
    if (!pr.hit && t >= pr.beat) {
      pr.hit = true;
      this.promptTxt.textContent = T("POWER!", "爆发！");
      this.promptCore.style.background = "#ffc928";
      this.sound("drum");
    }
    const fz = pr.hit ? Math.max(0, 1 - (t - pr.beat) / 0.35) : 0;
    this.promptEl.style.transform = `translate(-50%,-50%) scale(${1 + 0.18 * fz})`;
    this.w.forEach((w, i) => {
      if (w.tried || !this.pad(i).bDown) return;
      w.tried = true;
      const e = Math.abs(t - pr.beat);
      w.grade = e <= PERFECT ? 2 : e <= GOOD ? 1 : 0;
      this.grade(i, w.grade);
    });
    if (t > pr.beat + 0.36) {
      this.prompt = null;
      this.promptEl.style.display = "none";
      this.nextBeat = pr.beat + (this.hurried ? 2.6 + this.rnd() * 0.6 : 3.3 + this.rnd() * 1.0);
    }
  }

  private grade(i: number, g: number) {
    const head = this.avatars[i].pos.clone().add(new THREE.Vector3(0, 2.1, 0));
    if (g === 0) {
      this.w[i].slip = 0.6;
      this.hud.pop(head, T("MISSED!", "失手！"), "#c8c8d8", this.camera);
      this.sound("wrong");
      this.buzz(i, [30, 30, 30]);
      return;
    }
    this.pending += (i === 0 ? 1 : -1) * (g === 2 ? PUSH_PERFECT : PUSH_GOOD);
    this.w[i].jolt = 1.8;
    this.hud.pop(head, g === 2 ? T("PERFECT!", "完美！") : T("GOOD!", "不错！"), g === 2 ? "#ffe14a" : "#7dff8a", this.camera);
    this.sound(g === 2 ? "hit" : "whoosh");
    this.shake = g === 2 ? 0.12 : 0.06;
    this.buzz(i, g === 2 ? 80 : 40);
    this.jumpMugs(g === 2 ? 2.2 : 1.2);
    const h = this.handPos();
    this.fx.burst(h, { count: g === 2 ? 14 : 6, colors: ["#ffe14a", "#ffffff"], speed: 3, size: 0.06, life: 0.4, shape: "ball" });
  }

  private end(w: number | null) {
    if (this.finished) return;
    this.winner = w;
    this.promptEl.style.display = "none";
    if (w === null) this.finish([1, 1]);
    else this.finishByScore(this.players.map((_, i) => (i === w ? 1 : 0)));
  }

  // ------------------------------------------------------------ drawing

  private handPos() {
    const a = this.p * MAXA;
    return this.tmp2.set(Math.sin(a) * FORE, TY + 0.04 + Math.cos(a) * FORE, 0);
  }

  private jumpMugs(v: number) {
    for (const m of this.mugs) m.vy = Math.max(m.vy, v * (0.7 + Math.random() * 0.5));
  }

  private animateWorld(dt: number) {
    const fl = 0.85 + Math.sin(this.t * 13) * 0.08 + Math.sin(this.t * 7.3) * 0.07;
    this.fire.intensity = 6 * fl;
    this.flames.forEach((f, k) => (f.scale.y = 0.7 * (0.8 + Math.sin(this.t * (9 + k * 3) + k) * 0.2)));
    for (const c of this.crowd) {
      c.ph += dt * (4 + 7 * this.cheer);
      c.g.position.y = Math.abs(Math.sin(c.ph)) * (0.04 + 0.22 * this.cheer);
    }
    for (const m of this.mugs) {
      m.vy -= 14 * dt;
      m.y += m.vy * dt;
      if (m.y < m.y0) {
        m.y = m.y0;
        m.vy = 0;
      }
      m.m.position.y = m.y;
    }
  }

  /** Every frame after the avatars' own animation: arms on the table, bodies straining. */
  private rig() {
    const hand = this.handPos();
    this.players.forEach((_, i) => {
      const a = this.avatars[i];
      const w = this.w[i];
      const sd = i === 0 ? -1 : 1;
      // winning = leaning in; losing = pushed back
      const adv = (i === 0 ? this.p : -this.p) * 0.25;
      const shake = Math.sin(this.t * 50 + i) * 0.015 * Math.min(1, w.rate / 6);
      if (!this.finished) a.root.rotation.x = 0.32 + adv + w.jolt * 0.06 + shake;
      if (this.finished && this.winner === i) {
        // the free arm up in triumph
        a.rig.armL.rotation.x = -2.7 + Math.sin(this.t * 9) * 0.25;
        a.rig.armL.rotation.z = -0.2;
      } else a.rig.armL.rotation.x = -0.9;
      a.root.updateMatrixWorld(true);
      a.rig.armR.getWorldPosition(this.tmp);
      const shoulder = this.tmp.clone();
      const elbow = new THREE.Vector3(sd * 0.3, TY + 0.07, 0.02 * sd);
      const h = hand.clone();
      h.z = -0.03 * sd;
      h.x += Math.sin(this.t * 47 + i * 2) * 0.004 * w.rate;
      // (posed in the world, kept in the body's frame)
      const body = a.snark.root;
      this.inv.copy(body.matrixWorld).invert();
      body.getWorldScale(this.sv);
      const k = this.sv.x;
      const dir = h.clone().sub(elbow).normalize();
      const grip = h.clone().addScaledVector(dir, -w.arm.hand.h * k * 0.5);
      this.seg(w.arm.upper, shoulder, elbow, k);
      this.seg(w.arm.fore, elbow, grip, k);
      this.seg(w.arm.hand, grip, h.clone().addScaledVector(dir, w.arm.hand.h * k * 0.5), k);
    });
  }

  /** Stretch a part of the arm between two world points (its width the body's). */
  private seg(s: Seg, a: THREE.Vector3, b: THREE.Vector3, k: number) {
    const d = b.clone().sub(a);
    const len = Math.max(1e-3, d.length());
    this.q.setFromUnitVectors(this.up, d.multiplyScalar(1 / len));
    const mid = a.clone().add(b).multiplyScalar(0.5);
    this.mw.compose(mid, this.q, this.sv.set(k, len / s.h, k));
    s.g.matrix.multiplyMatrices(this.inv, this.mw);
  }

  update(dt: number) {
    super.update(dt);
    this.rig();
  }
  preview(dt: number) {
    super.preview(dt);
    this.rig();
  }
  outro(dt: number) {
    super.outro(dt);
    this.rig();
  }

  protected celebrate(res: MiniResult) {
    this.avatars.forEach((a, i) => {
      a.anim = "sit";
      if (this.winner !== null) a.root.rotation.x = res.place[i] === 1 ? 0.1 : 0.55;
    });
  }

  protected outroStep(dt: number) {
    this.animateWorld(dt);
    if (this.winner !== null) {
      const target = this.winner === 0 ? 1 : -1;
      this.p = damp(this.p, target, 10, dt);
      if (!this.slammed && Math.abs(this.p - target) < 0.05) {
        this.slammed = true;
        this.sound("crash");
        this.sound("cheer");
        this.shake = 0.35;
        this.jumpMugs(3);
        const h = this.handPos();
        this.fx.burst(h, { count: 22, colors: ["#d8b080", "#ffffff", "#ffe14a"], speed: 4, up: 2, size: 0.08, life: 0.6, shape: "ball" });
        this.fx.ring({ x: h.x, y: TY + 0.01, z: 0 }, "#fff3c0", 0.8, 0.4);
        this.cheer = 1;
      }
      this.avatars.forEach((a, i) => {
        if (i === this.winner) a.root.rotation.x = damp(a.root.rotation.x, 0.05, 4, dt);
      });
    }
    this.cheer = damp(this.cheer, 1, 2, dt);
    this.moveCam([0, 3.1, 4.6], [0, 0.95, 0], dt, 1.5);
  }
}

const def: MiniDef = {
  id: "bras-de-fer",
  name: "Arm Wrestle",
  icon: "💪",
  color: "#ff7a4a",
  tagline: "Mash to bend your rival's arm.",
  rules: "Mash A to push. When the POWER ring closes, press B right on time for a big shove. Pin their hand to the table!",
  controls: { a: "Push", b: "Power shove (on time)", mash: true },
  modes: ["duel"],
  length: 20,
  music: "tense",
  create: (ctx) => new BrasDeFer(ctx),
};
export default def;
