/**
 * 1, 2, 3… SOLEIL ! (1 contre 3, 45 s): a long schoolyard. The solo stands at the far end (right),
 * facing a big tree. A = turn around: the turn takes 0.4 s ("SOLEIL !"), then they watch (3 s at
 * most). Whoever moves while watched is caught and sent back to the start; caught twice = out. The
 * solo must face the tree at least 1 s between two looks. The trio wins if one of them touches the
 * solo before the end; otherwise (or if all are out) the solo wins.
 */
import * as THREE from "three";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef } from "../types";
import { ball, box, canvasTex, cloud, cone, cyl, flat, group, toon, tree } from "../../engine/gfx";
import { clamp, dist2 } from "../../engine/util";
import { music } from "../../engine/audio";
import { T } from "../../../../i18n/lang";

const TIME = 45;
const X0 = -12.5; // start line
const XS = 13.2; // the solo
const HZ = 4.2; // lane half-width
const PR = 0.42;
const SPEED = 2.4;
const ACCEL = 9;
const DECEL = 16;
const MOVING = 0.5; // speed above which you are "moving"
const TURN = 0.4;
const MIN_AWAY = 1.0;
const MAX_LOOK = 3.0;
const TOUCH = 1.25;
const LIVES = 2;
/** CPU runners: reaction to the turn (s) = REACT0 − REACT_LV × level (+ jitter). */
const REACT0 = 0.30;
const REACT_LV = 0.2;
const REACT_JIT = 0.25;

type Phase = "away" | "turn" | "look" | "back";

interface Runner {
  x: number;
  z: number;
  vx: number;
  vz: number;
  lives: number;
  out: boolean;
  fly: number;
  fx0: number;
  fz0: number;
  fx1: number;
  fz1: number;
  safe: number;
  lane: number;
  /** CPU: when it reacts to the current turn (game time), and its patience. */
  react: number;
  brave: number;
}

class UnDeuxTroisSoleil extends BaseMini {
  private run: Runner[] = [];
  private phase: Phase = "away";
  private phaseT = 0;
  private catches = 0;
  private outN = 0;
  private over = 0;
  private winner = -1;
  private hurried = false;
  private tint!: THREE.Mesh;
  private eye!: THREE.Sprite;
  private chant!: THREE.Sprite;
  private status!: HTMLElement;
  private statusKey = "";
  private leaves: THREE.Object3D[] = [];
  // CPU solo
  private wait = 1.5;
  private lookFor = 1;

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#6cc0ff", "#fff1d6"], size: 18, sun: [-0.3, 1, 0.6], fog: { near: 50, far: 110 } });
    this.buildYard();
    const sa = this.spawn(0, XS, 0, Math.PI / 2);
    sa.setRing(this.players[0].char.color);
    const lanes = [-2.6, 0, 2.6];
    for (let k = 1; k < this.players.length; k++) {
      const z = lanes[(k - 1) % 3];
      const a = this.spawn(k, X0 - 0.4, z, Math.PI / 2);
      a.setRing(this.players[k].char.color);
      this.run[k] = { x: X0 - 0.4, z, vx: 0, vz: 0, lives: LIVES, out: false, fly: -1, fx0: 0, fz0: 0, fx1: 0, fz1: 0, safe: 0, lane: z, react: 0, brave: 0 };
    }
    this.hud.players(this.players, (p) => (p.team === 0 ? "👀 0" : this.hearts(LIVES)), { teams: true });
    this.hud.timer(TIME);
    this.status = this.hud.add(`<div class="st" style="position:absolute;left:50%;top:calc(var(--u)*7.8);transform:translateX(-50%);padding:calc(var(--u)*0.5) calc(var(--u)*2.4);border-radius:999px;font-family:var(--title);font-size:calc(var(--u)*2.8);color:#fff;-webkit-text-stroke:calc(var(--u)*0.18) #1d1630;paint-order:stroke fill;border:calc(var(--u)*0.3) solid #1d1630;white-space:nowrap;transition:background 0.15s"></div>`);
    this.setStatus("go");
    this.setCam([-2, 26, 26], [0, 0, 0], 40);
  }

  private hearts(n: number) {
    return n <= 0 ? T("Out", "出局") : "❤️".repeat(n) + "🖤".repeat(LIVES - n);
  }

  private setStatus(k: "go" | "turn" | "stop") {
    if (k === this.statusKey) return;
    this.statusKey = k;
    const el = this.status.firstElementChild as HTMLElement;
    const [bg, txt] = k === "go" ? ["#3fcf5a", T("🟢 GO!", "🟢 前进！")] : k === "turn" ? ["#ff9a2e", T("⚠️ Turning round…", "⚠️ 要回头了……")] : ["#ff3b3b", T("👀 FREEZE! Don't move!", "👀 定住！别动！")];
    el.style.background = bg;
    el.textContent = txt;
  }

  // ------------------------------------------------------------ the schoolyard

  private buildYard() {
    const s = this.scene;
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), toon("#86c95e"));
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.03;
    grass.receiveShadow = true;
    s.add(grass);
    // the yard: tarmac with chalk drawings
    const tex = canvasTex(1024, 384, (g, w, h) => {
      g.fillStyle = "#9aa2b4";
      g.fillRect(0, 0, w, h);
      for (let k = 0; k < 900; k++) {
        g.fillStyle = k % 2 ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
        g.fillRect((k * 397) % w, (k * 233) % h, 3, 3);
      }
      // hopscotch
      g.strokeStyle = "rgba(255,255,255,0.75)";
      g.lineWidth = 4;
      const hx = w * 0.42,
        hy = h * 0.12;
      for (let k = 0; k < 6; k++) g.strokeRect(hx + k * 40, hy, 40, 40);
      g.font = "bold 26px sans-serif";
      g.fillStyle = "rgba(255,255,255,0.75)";
      for (let k = 0; k < 6; k++) g.fillText(String(k + 1), hx + k * 40 + 13, hy + 30);
      // chalk circles and a sun
      const cols = ["#ff8ad8", "#ffe14a", "#7fe3ff", "#9dff8a"];
      for (let k = 0; k < 7; k++) {
        g.strokeStyle = cols[k % 4];
        g.globalAlpha = 0.7;
        g.beginPath();
        g.arc((k * 151 + 60) % w, h * 0.82 - (k % 2) * 30, 18 + (k % 3) * 8, 0, Math.PI * 2);
        g.stroke();
      }
      g.globalAlpha = 1;
      g.strokeStyle = "#ffe14a";
      g.beginPath();
      g.arc(w * 0.75, h * 0.2, 26, 0, Math.PI * 2);
      g.stroke();
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        g.beginPath();
        g.moveTo(w * 0.75 + Math.cos(a) * 34, h * 0.2 + Math.sin(a) * 34);
        g.lineTo(w * 0.75 + Math.cos(a) * 46, h * 0.2 + Math.sin(a) * 46);
        g.stroke();
      }
    });
    const yard = new THREE.Mesh(new THREE.PlaneGeometry(34, 2 * HZ + 3), new THREE.MeshToonMaterial({ map: tex }));
    yard.rotation.x = -Math.PI / 2;
    yard.position.set(0.5, 0.01, 0);
    yard.receiveShadow = true;
    s.add(yard);
    // the start line and the "goal" circle around the solo
    box(s, flat("#ffffff"), 0.25, 0.02, 2 * HZ, { x: X0, y: 0.03, z: 0, cast: false });
    const startTex = canvasTex(512, 128, (g, w, h) => {
      g.font = `900 92px "Lilita One", "Fredoka", sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = "rgba(255,255,255,0.85)";
      g.fillText(T("START", "起点"), w / 2, h / 2 + 6);
    });
    const st = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), new THREE.MeshBasicMaterial({ map: startTex, transparent: true, depthWrite: false }));
    st.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
    st.position.set(X0 - 1.2, 0.03, 0);
    s.add(st);
    const goal = new THREE.Mesh(new THREE.RingGeometry(TOUCH + 0.25, TOUCH + 0.45, 40), flat("#ffe14a", 0.8));
    goal.rotation.x = -Math.PI / 2;
    goal.position.set(XS, 0.03, 0);
    s.add(goal);
    // the light on the lane: green while the solo looks away, red while watching
    this.tint = new THREE.Mesh(new THREE.PlaneGeometry(XS - X0, 2 * HZ), new THREE.MeshBasicMaterial({ color: "#3fcf5a", transparent: true, opacity: 0.12, depthWrite: false }));
    this.tint.rotation.x = -Math.PI / 2;
    this.tint.position.set((XS + X0) / 2, 0.04, 0);
    this.tint.renderOrder = 1;
    s.add(this.tint);
    // fences along the lane
    for (const sz of [-1, 1]) {
      const z = sz * (HZ + 1.3);
      box(s, "#2f6fd0", 34, 0.1, 0.1, { x: 0.5, y: 1.0, z });
      box(s, "#2f6fd0", 34, 0.1, 0.1, { x: 0.5, y: 0.45, z });
      for (let x = -16; x <= 17; x += 1.4) cyl(s, "#2f6fd0", 0.06, 1.2, { x, y: 0.6, z, seg: 6 });
    }
    // the big tree the solo faces
    const oak = group(s, { x: XS + 2.7, z: -0.6 });
    cyl(oak, "#7a4e2c", 0.7, 4.2, { y: 2.1, rTop: 0.5, seg: 12 });
    for (const [x, y, z, r] of [
      [0, 5, 0, 2.6],
      [1.2, 4.4, 1.3, 1.8],
      [-0.9, 4.6, -1.4, 1.9],
      [0.6, 6.4, -0.5, 1.7],
      [-1.0, 5.6, 1.4, 1.6],
    ]) {
      const m = ball(oak, "#3f9e43", r, { x, y, z, lo: true });
      this.leaves.push(m);
    }
    for (let k = 0; k < 6; k++) ball(oak, "#ff5a4e", 0.18, { x: Math.cos(k) * 2.2, y: 4.2 + (k % 3) * 0.7, z: Math.sin(k * 1.7) * 2.2, lo: true });
    // the school building behind
    const sc = group(s, { x: 0, z: -HZ - 8 });
    box(sc, "#f2d6a8", 34, 6, 4, { y: 3 });
    box(sc, "#c84a3a", 35, 1.2, 4.6, { y: 6.5 });
    for (let x = -15; x <= 15; x += 2.6) {
      if (Math.abs(x) < 2.5) continue;
      for (const y of [1.6, 4.1]) {
        box(sc, "#6ab0e8", 1.4, 1.4, 0.1, { x, y, z: 2.02, cast: false });
        box(sc, "#ffffff", 1.6, 0.14, 0.14, { x, y: y - 0.78, z: 2.05, cast: false });
      }
    }
    box(sc, "#7a4e2c", 2.4, 3.2, 0.2, { y: 1.6, z: 2.05 });
    box(sc, "#f2d6a8", 4, 3.5, 4, { y: 8.6 });
    cone(sc, "#c84a3a", 3.2, 2.6, { y: 11.6 });
    const clock = canvasTex(128, 128, (g) => {
      g.fillStyle = "#fff";
      g.beginPath();
      g.arc(64, 64, 60, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#1d1630";
      g.lineWidth = 6;
      g.stroke();
      g.beginPath();
      g.moveTo(64, 64);
      g.lineTo(64, 22);
      g.moveTo(64, 64);
      g.lineTo(94, 64);
      g.stroke();
    });
    const cm = new THREE.Mesh(new THREE.CircleGeometry(1.2, 24), new THREE.MeshBasicMaterial({ map: clock }));
    cm.position.set(0, 8.7, 2.02);
    sc.add(cm);
    // benches (where the eliminated sit) and trees
    for (const x of [-9, -4.5]) {
      box(s, "#c0843e", 3, 0.15, 0.7, { x, y: 0.55, z: HZ + 2.6 });
      box(s, "#c0843e", 3, 0.6, 0.12, { x, y: 0.95, z: HZ + 2.95 });
      for (const dx of [-1.3, 1.3]) box(s, "#555a66", 0.12, 0.55, 0.6, { x: x + dx, y: 0.27, z: HZ + 2.6 });
    }
    for (let k = 0; k < 7; k++) tree(s, -16 + k * 5.5, HZ + 6 + (k % 2) * 1.5, 1.5 + (k % 3) * 0.2, k % 2 ? "#5cc44f" : "#48b04a");
    for (const [x, y, z, scl] of [
      [-20, 15, -40, 2.4],
      [6, 17, -44, 3],
      [26, 14, -36, 2],
    ])
      cloud(s, x, y, z, scl);
    // the eye over the solo's head, and the chant
    const eyeTex = canvasTex(256, 160, (g, w, h) => {
      g.fillStyle = "#ffffff";
      g.strokeStyle = "#1d1630";
      g.lineWidth = 12;
      g.beginPath();
      g.ellipse(w / 2, h / 2, w / 2 - 12, h / 2 - 14, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = "#2f8dff";
      g.beginPath();
      g.arc(w / 2, h / 2, 42, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#1d1630";
      g.beginPath();
      g.arc(w / 2, h / 2, 22, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.arc(w / 2 + 12, h / 2 - 12, 9, 0, Math.PI * 2);
      g.fill();
    });
    this.eye = new THREE.Sprite(new THREE.SpriteMaterial({ map: eyeTex, transparent: true, depthTest: false }));
    this.eye.scale.set(2.4, 1.5, 1);
    this.eye.position.set(XS, 3.6, 0);
    this.eye.renderOrder = 5;
    s.add(this.eye);
    const chantTex = canvasTex(512, 128, (g, w, h) => {
      g.font = `900 80px "Lilita One", "Fredoka", sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.lineWidth = 14;
      g.strokeStyle = "#1d1630";
      const chant = T("1, 2, 3…", "一二三……");
      g.strokeText(chant, w / 2, h / 2 + 4);
      g.fillStyle = "#ffffff";
      g.fillText(chant, w / 2, h / 2 + 4);
    });
    this.chant = new THREE.Sprite(new THREE.SpriteMaterial({ map: chantTex, transparent: true, depthTest: false }));
    this.chant.scale.set(3.6, 0.9, 1);
    this.chant.position.set(XS - 0.4, 3.3, 0);
    this.chant.renderOrder = 5;
    s.add(this.chant);
  }

  // ------------------------------------------------------------ helpers

  private alive() {
    return this.run.filter((r) => r && !r.out);
  }
  private watching() {
    return this.phase === "look";
  }

  private setPhase(p: Phase) {
    this.phase = p;
    this.phaseT = 0;
    if (p === "turn") {
      // each CPU runner rolls its reaction for this turn
      this.run.forEach((r, i) => {
        if (!r) return;
        const lv = this.players[i].level;
        r.react = this.t + REACT0 - REACT_LV * lv + Math.random() * REACT_JIT;
      });
      this.hud.banner(T("FREEZE!", "木头人！"), { color: "#ffd23f", size: 11, ms: 700 });
      this.sound("whistle");
      this.setStatus("turn");
    } else if (p === "look") {
      this.setStatus("stop");
      this.sound("drum");
      const lv = this.players[0].level;
      this.lookFor = 0.45 + Math.random() * (0.9 + 0.9 * lv);
    } else if (p === "back") {
      this.sound("swing");
      this.run.forEach((r, i) => {
        if (!r) return;
        const lv = this.players[i].level;
        r.react = this.t + 0.12 + 0.3 * (1 - lv) * Math.random();
      });
    } else {
      this.setStatus("go");
      const lv = this.players[0].level;
      this.wait = MIN_AWAY + Math.pow(Math.random(), 1.3) * (2.4 - 1.0 * lv);
      this.run.forEach((r, i) => {
        if (r) r.brave = 1.6 + Math.random() * 2.4 + this.players[i].level;
      });
    }
  }

  // ------------------------------------------------------------ CPUs

  protected cpu(i: number, _dt: number): CpuPad {
    if (i === 0) {
      if (this.phase === "away" && this.phaseT >= MIN_AWAY) {
        // turn sooner when someone is close
        const front = Math.max(...this.alive().map((r) => r.x), X0);
        const close = front > XS - 6 ? 0.55 : 1;
        if (this.phaseT >= this.wait * close) return { a: true };
      }
      if (this.phase === "look" && this.phaseT > this.lookFor) return { a: true };
      return {};
    }
    const r = this.run[i];
    if (!r || r.out || r.fly >= 0 || this.over) return {};
    let go = false;
    if (this.phase === "away") go = this.phaseT < r.brave || r.x > XS - 2.2;
    else if (this.phase === "turn") go = this.t < r.react;
    else if (this.phase === "look") go = this.cpuChance(i, 0.012, 0.0); // a beginner may twitch
    else go = this.t >= r.react;
    if (!go) return {};
    // head for the solo along its lane, converging near the end
    const k = clamp((r.x - (XS - 8)) / 8, 0, 1);
    const tz = r.lane * (1 - k);
    const dz = clamp((tz - r.z) * 0.8, -0.6, 0.6);
    return { x: 1, y: dz };
  }

  // ------------------------------------------------------------ the game

  protected idle(dt: number) {
    this.moveCam(CAM_POS, CAM_LOOK, dt, 1.5);
    this.anim(dt);
  }

  start() {
    this.setPhase("away");
    this.hud.banner(T("Sneak up without being seen!", "别被看到，悄悄前进！"), { color: "#ffd23f", size: 6, ms: 1400 });
  }

  private anim(_dt: number) {
    const look = this.phase === "look";
    const turning = this.phase === "turn" || this.phase === "back";
    const m = this.tint.material as THREE.MeshBasicMaterial;
    m.color.set(look ? "#ff3b3b" : turning ? "#ff9a2e" : "#3fcf5a");
    m.opacity = look ? 0.26 + 0.08 * Math.sin(this.t * 14) : turning ? 0.2 : 0.12;
    this.eye.visible = look || (this.phase === "turn" && this.phaseT > TURN * 0.5);
    const sc = look ? 1 + 0.08 * Math.sin(this.t * 10) : 0.8;
    this.eye.scale.set(2.4 * sc, 1.5 * sc, 1);
    this.chant.visible = this.phase === "away" && !this.over;
    if (this.chant.visible) {
      const n = Math.min(3, Math.floor(this.phaseT / 0.35) + 1);
      this.chant.scale.set(3.6, 0.9, 1);
      (this.chant.material as THREE.SpriteMaterial).opacity = 0.5 + 0.5 * (n / 3);
    }
    for (const [k, l] of this.leaves.entries()) l.rotation.y = Math.sin(this.t * 1.5 + k) * 0.08;
  }

  protected step(dt: number) {
    const left = TIME - this.t;
    this.hud.timer(left);
    this.moveCam(CAM_POS, CAM_LOOK, dt, 3);
    this.phaseT += dt;
    if (!this.hurried && left <= 10 && !this.over) {
      this.hurried = true;
      this.hud.banner(T("10 SECONDS LEFT!", "还剩 10 秒！"), { color: "#ff7a5a", size: 6 });
      music.speed(1.15);
      this.sound("bell");
    }
    // the solo
    const sa = this.avatars[0];
    const p0 = this.pad(0);
    if (!this.over) {
      if (this.phase === "away" && p0.aDown && this.phaseT >= MIN_AWAY) this.setPhase("turn");
      else if (this.phase === "turn" && this.phaseT >= TURN) this.setPhase("look");
      else if (this.phase === "look" && (this.phaseT >= MAX_LOOK || (p0.aDown && this.phaseT > 0.25))) this.setPhase("back");
      else if (this.phase === "back" && this.phaseT >= TURN) this.setPhase("away");
    }
    const away = Math.PI / 2,
      toward = -Math.PI / 2;
    const k = clamp(this.phaseT / TURN, 0, 1);
    const e = k * k * (3 - 2 * k);
    sa.yaw = this.phase === "away" ? away : this.phase === "look" ? toward : this.phase === "turn" ? away + (toward - away) * e : toward + (away - toward) * e;
    sa.anim = this.phase === "away" ? "hold" : this.phase === "look" ? "idle" : "jump";
    if (this.over) sa.anim = this.winner === 0 ? "win" : "lose";
    sa.pos.set(XS, 0, 0);
    this.anim(dt);
    this.stepRunners(dt);

    if (this.over) {
      this.over += dt;
      if (this.over > 1.0) this.finishByTeam(this.winner);
      return;
    }
    if (this.alive().length === 0) {
      this.over = 0.001;
      this.winner = 0;
      this.hud.banner(T("ALL OUT!", "全部出局！"), { color: "#ff5a4e", size: 8 });
    } else if (left <= 0) {
      this.over = 0.4;
      this.winner = 0;
      this.hud.banner(T("TOO LATE!", "太晚了！"), { color: "#ffd23f", size: 8 });
      this.sound("buzzer");
    }
  }

  private stepRunners(dt: number) {
    this.run.forEach((r, i) => {
      if (!r) return;
      const a = this.avatars[i];
      if (r.fly >= 0) {
        r.fly += dt / 1.0;
        const k = Math.min(1, r.fly);
        r.x = r.fx0 + (r.fx1 - r.fx0) * k;
        r.z = r.fz0 + (r.fz1 - r.fz0) * k;
        a.pos.set(r.x, Math.sin(k * Math.PI) * 4.5, r.z);
        a.model.rotation.z = k * Math.PI * 4;
        a.anim = "fall";
        if (r.fly >= 1) {
          r.fly = -1;
          a.model.rotation.z = 0;
          a.pos.y = 0;
          r.vx = r.vz = 0;
          this.fx.dust(a.pos, 8);
          this.sound("land");
          if (!r.out) r.safe = 1.0;
        }
        return;
      }
      if (r.out) {
        a.anim = "sit";
        a.pos.set(r.x, 0.3, r.z);
        a.groundY = 0.3;
        a.face(0, dt, 4);
        return;
      }
      const p = this.pad(i);
      r.safe -= dt;
      const l = Math.hypot(p.x, p.y);
      const sx = l > 1 ? p.x / l : p.x,
        sz = l > 1 ? p.y / l : p.y;
      const tx = this.over ? 0 : sx * SPEED,
        tz = this.over ? 0 : sz * SPEED;
      const stopping = Math.hypot(tx, tz) < Math.hypot(r.vx, r.vz);
      const kk = 1 - Math.exp(-(stopping ? DECEL : ACCEL) * dt);
      r.vx += (tx - r.vx) * kk;
      r.vz += (tz - r.vz) * kk;
      r.x += r.vx * dt;
      r.z += r.vz * dt;
      r.x = clamp(r.x, X0 - 1.6, XS + 1.6);
      r.z = clamp(r.z, -HZ + PR, HZ - PR);
      // don't walk through the solo
      const ds = dist2(r.x, r.z, XS, 0);
      if (ds < 0.9) {
        r.x = XS + ((r.x - XS) / (ds || 1)) * 0.9;
        r.z = ((r.z - 0) / (ds || 1)) * 0.9;
      }
      const v = Math.hypot(r.vx, r.vz);
      a.anim = this.over ? a.anim : v > 0.4 ? "run" : "idle";
      a.speed = clamp(v / SPEED, 0, 1) * 0.8;
      if (v > 0.4) a.face(Math.atan2(r.vx, r.vz), dt);
      else if (!this.over) a.face(Math.PI / 2, dt, 4);
      a.pos.set(r.x, 0, r.z);
      a.groundY = 0;
      if (this.over) return;
      // caught moving?
      if (this.watching() && v > MOVING && r.safe <= 0) this.caught(i);
      // touched the solo!
      else if (ds < TOUCH) {
        this.over = 0.001;
        this.winner = 1;
        this.hud.banner(T("TAGGED!", "碰到了！"), { color: "#3fcf5a", size: 11, sub: T(`${this.players[i].name} got there first`, `${this.players[i].name} 抢先碰到`) });
        this.sound("fanfare");
        this.fx.confetti({ x: XS, y: 2, z: 0 });
        this.avatars[0].flash();
        this.buzz(i, 200);
        this.buzz(0, [100, 50, 100]);
      }
    });
    // bumps
    const al = this.alive().filter((r) => r.fly < 0);
    for (let m = 0; m < al.length; m++)
      for (let n = m + 1; n < al.length; n++) {
        const A = al[m],
          B = al[n];
        const dx = B.x - A.x,
          dz = B.z - A.z,
          d = Math.hypot(dx, dz);
        if (d < PR * 2 && d > 1e-4) {
          const push = (PR * 2 - d) / 2;
          A.x -= (dx / d) * push;
          A.z -= (dz / d) * push;
          B.x += (dx / d) * push;
          B.z += (dz / d) * push;
        }
      }
  }

  private caught(i: number) {
    const r = this.run[i];
    const a = this.avatars[i];
    r.lives--;
    this.catches++;
    this.hud.setScore(this.players[0].seat, `👀 ${this.catches}`);
    this.hud.setScore(this.players[i].seat, this.hearts(r.lives));
    this.hud.pop(new THREE.Vector3(r.x, 2.4, r.z), r.lives > 0 ? T("Moved!", "动了！") : T("Out!", "出局！"), "#ff5a4e", this.camera);
    this.sound("buzzer");
    this.sound("boing");
    this.buzz(i, [150, 60, 150]);
    this.buzz(0, 40);
    a.flash();
    this.fx.burst({ x: r.x, y: 1.2, z: r.z }, { count: 16, colors: ["#ff3b3b", "#ffffff", "#ffd23f"], speed: 5, size: 0.17 });
    r.fly = 0;
    r.fx0 = r.x;
    r.fz0 = r.z;
    if (r.lives <= 0) {
      r.out = true;
      this.outN++;
      this.hud.mark(this.players[i].seat, "out");
      r.fx1 = -10.2 + (this.outN - 1) * 1.2 + (this.outN > 2 ? 2.1 : 0);
      r.fz1 = HZ + 2.6;
    } else {
      r.fx1 = X0 - 0.4;
      r.fz1 = r.lane;
    }
  }

  /** Balance stats (headless tests). */
  simInfo() {
    return { catches: this.catches, out: this.outN, front: Math.round(Math.max(...this.alive().map((r) => r.x), -99)), t: Math.round(this.t) };
  }

  protected outroStep(dt: number) {
    this.anim(dt);
    // the eliminated stay seated on their bench
    this.run.forEach((r, i) => {
      if (r?.out && r.fly < 0) this.avatars[i].anim = "sit";
    });
    this.status.style.display = "none";
    this.eye.visible = false;
    this.moveCam([XS - 6.5, 5, 8], [XS - 2.2, 1, 0], dt, 2);
  }
}

const CAM_POS: [number, number, number] = [1.3, 17.5, 17.8];
const CAM_LOOK: [number, number, number] = [1.6, 0, 0.4];

const def: MiniDef = {
  id: "un-deux-trois-soleil",
  name: "Freeze!",
  icon: "☀️",
  color: "#ffd84a",
  tagline: "Move while it's not looking, freeze when it is!",
  rules: "The solo turns round with A: anyone moving while it looks goes back to the start (twice = out). The three must touch it within 45 s.",
  controls: { stick: "Move", a: "Turn round (solo)" },
  modes: ["1v3"],
  length: 45,
  music: "mini3",
  create: (ctx) => new UnDeuxTroisSoleil(ctx),
};
export default def;
