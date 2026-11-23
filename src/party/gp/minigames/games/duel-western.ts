/**
 * HIGH NOON (duel, first to 3 rounds): a desert town street at sunset. The two duelists start
 * back to back, walk five paces apart and turn. "READY", then a random 2–5 s wait, then "BANG!"
 * (big text + shot): the first to press A wins the round (reaction time in ms). Pressing before
 * the signal (decoys "BANK!", "BANJO!", "BLOCK!"… included) is a false start: the round is lost.
 * First to 3 rounds wins.
 */
import * as THREE from "three";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef } from "../types";
import { ball, box, canvasTex, cone, cyl, flat, group, toon } from "../../engine/gfx";
import { clamp, easeOutCubic } from "../../engine/util";
import { music, sfx } from "../../engine/audio";
import { T } from "../../../../i18n/lang";

const WIN = 3;
const MAX_ROUNDS = 9;
const DX = 4.4; // duelists' distance from the middle
/** The decoys (English, Chinese, and whether it sounds like the real thing: a pop, else a boing). */
const FAKES: [string, string, boolean][] = [
  ["BANK!", "碰！", true],
  ["BANJO!", "棒！", true],
  ["BANANA!", "蹦！", true],
  ["BAND!", "崩！", true],
  ["BLOCK!", "平！", false],
  ["BAGEL!", "朋！", false],
];

type Phase = "walk" | "ready" | "wait" | "fire" | "result" | "done";

interface Duelist {
  holder: THREE.Group;
  gun: THREE.Group;
  wins: number;
  side: number;
  fallen: number;
  /** CPU: when it will press (game time), or -1. */
  pressAt: number;
}

class DuelWestern extends BaseMini {
  private phase: Phase = "walk";
  private pt = 0;
  private round = 0;
  private duel: Duelist[] = [];
  private waitFor = 3;
  private fakes: { at: number; word: string; near: boolean; shown: boolean }[] = [];
  private fireT = 0;
  private bigEl: HTMLElement | null = null;
  private winner = -1;
  falseStart = -1;
  private lastPace = -1;
  private sunDisc!: THREE.Mesh;
  private weed!: THREE.Group;
  private weedX = -30;
  private dustT = 0;
  private flash!: THREE.Mesh;
  private flashT = 0;
  private heartT = 0;
  private hats: THREE.Group[] = [];

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#3a2a6a", "#ff9a4a"], size: 14, sun: [-0.2, 0.45, 0.8], sunColor: "#ffb070", sunIntensity: 2.4, hemi: ["#ffc890", "#6a3a3a", 1.4], fog: { color: "#ffa868", near: 30, far: 90 } });
    this.buildTown();
    this.players.forEach((p, i) => {
      const side = i === 0 ? -1 : 1;
      const holder = group(this.scene, { x: side * 0.45 });
      const a = this.spawn(i, 0, 0, side * (Math.PI / 2));
      holder.add(a.root);
      a.pos.set(0, 0, 0);
      a.setRing(p.char.color);
      // a cowboy hat (on the zkSNARK's hood: placeHats) and a revolver for everyone
      const hat = group(a.rig.head);
      this.hats.push(hat);
      cyl(hat, "#7a4a2a", 0.48, 0.05, { seg: 20 });
      cyl(hat, "#7a4a2a", 0.26, 0.28, { y: 0.15, rTop: 0.22, seg: 14 });
      cyl(hat, p.char.color, 0.265, 0.07, { y: 0.06, seg: 14 });
      const gun = group(a.rig.armR, { y: -0.4 });
      box(gun, "#3a3a48", 0.08, 0.42, 0.1, { y: -0.2 });
      cyl(gun, "#5a5a6a", 0.08, 0.12, { y: -0.04, rx: Math.PI / 2, seg: 8 });
      box(gun, "#6a4a2a", 0.07, 0.09, 0.24, { y: 0.02, z: -0.13, rx: 0.25 });
      gun.visible = false;
      this.duel.push({ holder, gun, wins: 0, side, fallen: 0, pressAt: -1 });
    });
    this.flash = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), flat("#fff6c0", 0.95, true));
    this.flash.visible = false;
    this.scene.add(this.flash);
    this.hud.add(
      `<style>
      .dw-big{position:absolute;left:50%;top:30%;transform:translate(-50%,-50%);font-family:var(--title);white-space:nowrap;color:#fff;-webkit-text-stroke:calc(var(--u)*.45) #1d1630;paint-order:stroke fill;text-shadow:0 calc(var(--u)*.7) 0 rgba(0,0,0,.35);pointer-events:none}
      .dw-big.ready{font-size:calc(var(--u)*8);color:#ffe9c0;animation:dwpulse 1.2s ease-in-out infinite}
      .dw-big.pan{font-size:calc(var(--u)*16);color:#ffd23f;animation:dwbang .25s cubic-bezier(.2,1.8,.4,1)}
      .dw-big.fake{font-size:calc(var(--u)*13);color:#ffd23f;animation:dwbang .25s cubic-bezier(.2,1.8,.4,1)}
      .dw-big.fake.early{font-size:calc(var(--u)*10)}
      .dw-big .sub{display:block;font-size:.3em;-webkit-text-stroke:calc(var(--u)*.25) #1d1630;color:#fff;text-align:center}
      @keyframes dwpulse{0%,100%{transform:translate(-50%,-50%) scale(1)}50%{transform:translate(-50%,-50%) scale(1.06)}}
      @keyframes dwbang{0%{transform:translate(-50%,-50%) scale(2.4) rotate(-8deg);opacity:0}100%{transform:translate(-50%,-50%) scale(1) rotate(-4deg);opacity:1}}
      .dw-ms{font-family:var(--title);font-size:calc(var(--u)*2.6)!important;background:#fffaf0!important;color:#1d1630!important;border:calc(var(--u)*.3) solid #1d1630}
      .dw-ms.bad{background:#ff4b3e!important;color:#fff!important}
      .dw-pips{display:inline-flex;gap:calc(var(--u)*.35);vertical-align:middle}
      .dw-pips i{width:calc(var(--u)*1.7);height:calc(var(--u)*1.7);border-radius:50%;border:calc(var(--u)*.25) solid #fff;display:inline-block}
      .dw-pips i.on{background:#ffd23f;box-shadow:0 0 calc(var(--u)*.8) #ffd23f}
      </style>`,
    );
    this.hud.players(this.players, () => this.pips(0));
    this.setCam([0, 3.5, 18], [0, 2.2, 0], 40);
  }

  private pips(n: number) {
    let h = '<span class="dw-pips">';
    for (let k = 0; k < WIN; k++) h += `<i class="${k < n ? "on" : ""}"></i>`;
    return h + "</span>";
  }

  // ------------------------------------------------------------ the town

  private buildTown() {
    const s = this.scene;
    const sand = canvasTex(
      256,
      256,
      (g, w) => {
        g.fillStyle = "#e0a868";
        g.fillRect(0, 0, w, w);
        for (let i = 0; i < 400; i++) {
          g.fillStyle = ["#d49858", "#eab878", "#c88a50"][i % 3];
          g.fillRect((i * 97) % w, (i * 53 + i * 7) % w, 3 + (i % 3), 2);
        }
      },
      true,
    );
    sand.repeat.set(12, 12);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshToonMaterial({ map: sand }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    s.add(ground);
    // the setting sun and far mesas
    this.sunDisc = new THREE.Mesh(new THREE.CircleGeometry(7, 40), flat("#ffdd66"));
    this.sunDisc.position.set(0, 6, -70);
    s.add(this.sunDisc);
    const halo = new THREE.Mesh(new THREE.CircleGeometry(11, 40), flat("#ffb04a", 0.35, true));
    halo.position.set(0, 6, -70.5);
    s.add(halo);
    const mesa = toon("#b0584a");
    for (const [x, w, h, z] of [
      [-40, 22, 9, -55],
      [-14, 12, 6, -60],
      [28, 26, 11, -58],
      [52, 14, 7, -52],
    ]) {
      box(s, mesa, w, h, 8, { x, y: h / 2, z, cast: false });
      box(s, "#c8705a", w * 0.8, 1, 7, { x, y: h + 0.5, z, cast: false });
    }
    // façades along the back of the street
    // two rows of buildings, the street opening on the setting sun in the middle
    const signs = ["SALOON", "ZEC BANK", "HOTEL", "GENERAL STORE"];
    const cols = ["#b8703f", "#a05a3a", "#8a5a3a", "#b0603a"];
    const xs = [-17, -9, 9, 17];
    signs.forEach((name, k) => {
      const x = xs[k];
      const h = 5.5 + (k % 2) * 1.5;
      const b = group(s, { x, z: -7 });
      box(b, cols[k], 7, h, 4, { y: h / 2 });
      box(b, "#6a3a22", 7.4, 0.3, 1.8, { y: 3.2, z: 2.6 });
      for (const px of [-3.4, 3.4]) box(b, "#6a3a22", 0.2, 3.2, 0.2, { x: px, y: 1.6, z: 3.4 });
      box(b, "#4a2a1a", 1.6, 2.4, 0.1, { y: 1.2, z: 2.02 });
      for (const wx of [-2.2, 2.2]) {
        box(b, "#2a3040", 1.2, 1.2, 0.1, { x: wx, y: 1.6, z: 2.02, cast: false });
        box(b, "#2a3040", 1.0, 1.0, 0.1, { x: wx, y: h - 1.6, z: 2.02, cast: false });
      }
      const tex = canvasTex(256, 64, (g, w, hh) => {
        g.fillStyle = "#f4e0b0";
        g.fillRect(0, 0, w, hh);
        g.strokeStyle = "#5a3a22";
        g.lineWidth = 8;
        g.strokeRect(4, 4, w - 8, hh - 8);
        g.fillStyle = "#5a2a1a";
        // (a long name shrinks to fit the board)
        let px = 40;
        g.font = `800 ${px}px Geist, Roboto, sans-serif`;
        while (px > 24 && g.measureText(name).width > w - 32) g.font = `800 ${(px -= 2)}px Geist, Roboto, sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(name, w / 2, hh / 2 + 3);
      });
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshBasicMaterial({ map: tex }));
      sg.position.set(x, h - 0.6, -4.9);
      s.add(sg);
    });
    // the trail out of town: fence posts fading into the desert
    for (let k = 0; k < 7; k++) {
      const z = -9 - k * 5;
      for (const sx of [-1, 1]) box(s, "#7a4a2a", 0.2, 1.2, 0.2, { x: sx * (4.2 + k * 0.4), y: 0.6, z, cast: false });
    }
    // a water tower and cacti
    const wt = group(s, { x: 21, z: -10 });
    for (const [x, z] of [
      [-1.2, -1.2],
      [1.2, -1.2],
      [-1.2, 1.2],
      [1.2, 1.2],
    ])
      box(wt, "#6a3a22", 0.25, 6, 0.25, { x, y: 3, z });
    cyl(wt, "#9a6a3a", 2, 2.6, { y: 7.3, seg: 16 });
    cone(wt, "#6a3a22", 2.2, 1.2, { y: 9.2, lo: true });
    const cactus = (x: number, z: number, k: number) => {
      const c = group(s, { x, z });
      cyl(c, "#4a9a4a", 0.35 * k, 3 * k, { y: 1.5 * k, seg: 10 });
      ball(c, "#4a9a4a", 0.35 * k, { y: 3 * k, lo: true });
      cyl(c, "#4a9a4a", 0.22 * k, 1.1 * k, { x: 0.6 * k, y: 1.9 * k, seg: 8 });
      cyl(c, "#4a9a4a", 0.22 * k, 0.6 * k, { x: 0.35 * k, y: 1.4 * k, rz: Math.PI / 2, seg: 8 });
      cyl(c, "#4a9a4a", 0.22 * k, 0.9 * k, { x: -0.55 * k, y: 1.5 * k, seg: 8 });
      cyl(c, "#4a9a4a", 0.22 * k, 0.5 * k, { x: -0.3 * k, y: 1.1 * k, rz: Math.PI / 2, seg: 8 });
    };
    cactus(-11, 4, 1);
    cactus(12.5, 3, 0.8);
    cactus(-24, -14, 1.5);
    cactus(30, -18, 1.6);
    // barrels and a hitching post
    for (const [x, z] of [
      [-7.5, -3.4],
      [-6.6, -3.0],
      [8.2, -3.2],
    ]) {
      cyl(s, "#8a5a32", 0.45, 1.1, { x, y: 0.55, z, seg: 12 });
      cyl(s, "#3a3440", 0.47, 0.07, { x, y: 0.85, z, seg: 12 });
    }
    box(s, "#6a3a22", 3, 0.15, 0.15, { x: 4, y: 1.1, z: -3.2 });
    for (const x of [2.6, 5.4]) box(s, "#6a3a22", 0.15, 1.2, 0.15, { x, y: 0.6, z: -3.2 });
    // a tumbleweed
    this.weed = group(s, { y: 0.6, z: -2.4 });
    for (let k = 0; k < 3; k++) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 4, 12), toon("#a8804a"));
      t.rotation.set(k * 1.1, k * 0.7, 0);
      this.weed.add(t);
    }
  }

  // ------------------------------------------------------------ rounds

  private startRound() {
    this.round++;
    this.phase = "walk";
    this.pt = 0;
    this.winner = -1;
    this.falseStart = -1;
    this.lastPace = -1;
    this.big(null);
    this.duel.forEach((d, i) => {
      d.fallen = 0;
      d.gun.visible = false;
      d.pressAt = -1;
      const a = this.avatars[i];
      a.anim = "idle";
      a.setVisible(true);
    });
    // the wait and its decoys (more of them later)
    this.waitFor = 2 + this.rnd() * 3;
    this.fakes = [];
    const nf = this.round === 1 ? (this.rnd() < 0.5 ? 1 : 0) : Math.floor(this.rnd() * (this.round >= 3 ? 3 : 2)) + (this.round >= 3 ? 1 : 0);
    for (let k = 0; k < nf; k++) {
      const at = 0.8 + this.rnd() * Math.max(0.2, this.waitFor - 1.4);
      const [en, zh, near] = FAKES[Math.floor(this.rnd() * FAKES.length)];
      this.fakes.push({ at, word: T(en, zh), near, shown: false });
    }
    this.fakes.sort((a, b) => a.at - b.at);
    if (this.round > 1) this.hud.banner(T(`Round ${this.round}`, `第 ${this.round} 局`), { color: "#ffd23f", size: 6, ms: 800 });
  }

  private big(html: string | null, cls = "") {
    this.bigEl?.remove();
    this.bigEl = html === null ? null : this.hud.add(html, `dw-big ${cls}`);
  }

  start() {
    this.startRound();
  }

  protected idle(dt: number) {
    this.moveCam([0, 2.6, 13.5], [0, 2.0, 0], dt, 1.2);
    this.ambient(dt);
    // back to back
    this.duel.forEach((d, i) => {
      d.holder.position.x = d.side * 0.45;
      this.avatars[i].yaw = d.side * (Math.PI / 2);
    });
  }

  /** The hats sit on the hood's top, sized to it (a zkSNARK's head is its own; its art may load late). */
  private placeHats() {
    this.hats.forEach((h, i) => {
      const b = this.avatars[i].snark.headBox;
      if (b.isEmpty()) return;
      h.position.set((b.min.x + b.max.x) / 2, b.max.y - 0.05, (b.min.z + b.max.z) / 2);
      h.scale.setScalar(clamp((b.max.x - b.min.x) / 0.62, 0.9, 1.5));
    });
  }

  private ambient(dt: number) {
    this.placeHats();
    this.weedX += dt * 3.2;
    if (this.weedX > 24) this.weedX = -24 - this.rnd() * 20;
    this.weed.position.x = this.weedX;
    this.weed.position.y = 0.6 + Math.abs(Math.sin(this.weedX * 1.3)) * 0.4;
    this.weed.rotation.z -= dt * 6;
    this.dustT -= dt;
    if (this.dustT <= 0) {
      this.dustT = 0.35;
      this.fx.burst({ x: -14 + Math.random() * 28, y: 0.2, z: 3 + Math.random() * 3 }, { count: 2, colors: ["#f0c890"], speed: 0.6, up: 0.4, gravity: -0.2, size: 0.25, sizeEnd: 0, life: 1.6, shape: "ball", drag: 1 });
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.flash.visible = this.flashT > 0;
      this.flash.scale.setScalar(1 + (0.12 - this.flashT) * 12);
    }
  }

  protected cpu(i: number): CpuPad {
    const d = this.duel[i];
    if (this.phase !== "wait" && this.phase !== "fire") return {};
    return { a: d.pressAt >= 0 && this.t >= d.pressAt };
  }

  private reaction(i: number) {
    const lv = this.players[i].level;
    // 0.45 s for an easy CPU (level 0.3) … 0.2 s for an expert (0.9)
    return 0.45 - 0.25 * clamp((lv - 0.3) / 0.6, 0, 1) + (Math.random() - 0.5) * 0.08;
  }

  protected step(dt: number) {
    this.pt += dt;
    this.ambient(dt);
    const tense = this.phase === "wait" || this.phase === "ready";
    this.moveCam(tense ? [0, 2.0, 10.8] : this.phase === "result" ? [this.winner >= 0 ? this.duel[this.winner].side * 1.2 : 0, 2.4, 11.6] : [0, 2.6, 13.5], [0, 1.9, 0], dt, tense ? 0.6 : 2.2);
    switch (this.phase) {
      case "walk": {
        // five paces apart, then turn
        const walkT = this.round === 1 ? 2.2 : 1.0;
        const u = clamp(this.pt / walkT, 0, 1);
        this.duel.forEach((d, i) => {
          const a = this.avatars[i];
          if (this.round === 1) {
            d.holder.position.x = d.side * (0.45 + (DX - 0.45) * u);
            a.yaw = d.side * (Math.PI / 2);
            a.anim = u < 1 ? "run" : "idle";
            a.speed = 0.25;
          } else {
            d.holder.position.x += (d.side * DX - d.holder.position.x) * Math.min(1, dt * 8);
          }
        });
        if (this.round === 1) {
          const pace = Math.floor(u * 5);
          if (pace !== this.lastPace && u < 1) {
            this.lastPace = pace;
            this.sound("step");
            this.big(`${pace + 1}`, "ready");
          }
        }
        if (this.pt > walkT + 0.3) {
          this.duel.forEach((d, i) => (this.avatars[i].yaw = -d.side * (Math.PI / 2)));
          this.phase = "ready";
          this.pt = 0;
          this.big(T(`READY<span class="sub">Press A on “BANG!”</span>`, `准备<span class="sub">听到“砰！”就按 A</span>`), "ready");
          this.sound("drum");
        }
        break;
      }
      case "ready":
        this.faceEachOther(dt);
        if (this.pt > 1.2) {
          this.phase = "wait";
          this.pt = 0;
          this.heartT = 0;
          // CPUs fooled by decoys (beginners more often)
          this.duel.forEach((d, i) => {
            if (!this.players[i].cpu) return;
            for (const f of this.fakes) if (Math.random() < 0.38 * (1 - this.players[i].level) + 0.02) {
              d.pressAt = this.t + f.at + this.reaction(i);
              break;
            }
          });
        }
        this.checkEarly();
        break;
      case "wait": {
        this.faceEachOther(dt);
        this.heartT -= dt;
        if (this.heartT <= 0) {
          this.heartT = Math.max(0.45, 0.9 - this.pt * 0.08);
          this.sound("heartbeat");
        }
        for (const f of this.fakes) {
          if (!f.shown && this.pt >= f.at) {
            f.shown = true;
            this.big(f.word, "fake");
            this.sound(f.near ? "pop" : "boing");
          }
          if (f.shown && this.pt >= f.at + 0.7 && this.bigEl?.classList.contains("fake") && this.bigEl.textContent === f.word) this.big(T("READY", "准备"), "ready");
        }
        if (this.checkEarly()) break;
        if (this.pt >= this.waitFor) {
          this.phase = "fire";
          this.pt = 0;
          this.fireT = this.t;
          this.big(T("BANG!", "砰！"), "pan");
          this.sound("shoot");
          this.sound("explode");
          this.shake = 0.25;
          this.duel.forEach((d, i) => {
            if (this.players[i].cpu && (d.pressAt < 0 || d.pressAt > this.t)) d.pressAt = this.t + this.reaction(i);
          });
        }
        break;
      }
      case "fire": {
        const pressed = this.players.map((_, i) => this.pad(i).aDown);
        if (pressed[0] || pressed[1]) {
          const w = pressed[0] && pressed[1] ? (this.rnd() < 0.5 ? 0 : 1) : pressed[0] ? 0 : 1;
          this.shoot(w, (this.t - this.fireT) * 1000);
        } else if (this.pt > 2.5) {
          // nobody drew: replay the round
          this.big(T(`Nobody?<span class="sub">Again!</span>`, `没人开枪？<span class="sub">重来！</span>`), "ready");
          this.phase = "result";
          this.pt = 0.6;
          this.round--;
          this.sound("aww");
        }
        break;
      }
      case "result": {
        // the loser falls backward
        this.duel.forEach((d) => {
          if (d.fallen > 0) {
            d.fallen = Math.min(1, d.fallen + dt * 2.2);
            d.holder.rotation.z = -d.side * (Math.PI / 2) * 0.92 * easeOutCubic(d.fallen);
          }
        });
        if (this.pt > 3.2) {
          const champ = this.duel.findIndex((d) => d.wins >= WIN);
          if (champ >= 0 || this.round >= MAX_ROUNDS) {
            this.phase = "done";
            this.big(null);
            this.finishByScore(this.duel.map((d) => d.wins));
          } else {
            this.duel.forEach((d) => (d.holder.rotation.z = 0));
            this.startRound();
          }
        }
        break;
      }
    }
  }

  private faceEachOther(dt: number) {
    this.duel.forEach((d, i) => {
      const a = this.avatars[i];
      a.face(-d.side * (Math.PI / 2), dt, 10);
      d.holder.position.x += (d.side * DX - d.holder.position.x) * Math.min(1, dt * 6);
      if (a.anim === "run") a.anim = "idle";
    });
  }

  /** A press before "BANG!": false start, the other one wins the round. */
  private checkEarly(): boolean {
    for (let i = 0; i < this.players.length; i++) {
      if (!this.pad(i).aDown) continue;
      this.falseStart = i;
      const o = 1 - i;
      this.duel[o].wins++;
      this.hud.setScore(this.players[o].i, this.pips(this.duel[o].wins));
      this.big(T(`False start!<span class="sub">${this.players[i].name} shot too soon</span>`, `抢枪了！<span class="sub">${this.players[i].name} 开枪太早</span>`), "fake early");
      this.sound("buzzer");
      this.sound("shoot");
      const a = this.avatars[i];
      this.duel[i].gun.visible = true;
      a.anim = "stun";
      this.avatars[o].anim = "win";
      this.hud.pop(a.pos.clone().setY(2.4).add(this.duel[i].holder.position), T("Too soon!", "太早了！"), "#ff6a5a", this.camera);
      this.buzz(i, [80, 50, 80]);
      this.phase = "result";
      this.pt = 0;
      return true;
    }
    return false;
  }

  private shoot(w: number, ms: number) {
    this.winner = w;
    const l = 1 - w;
    const dw = this.duel[w],
      dl = this.duel[l];
    dw.wins++;
    this.hud.setScore(this.players[w].i, this.pips(dw.wins));
    dw.gun.visible = true;
    const aw = this.avatars[w],
      al = this.avatars[l];
    aw.anim = "push";
    aw.speed = 0;
    al.anim = "stun";
    al.flash();
    dl.fallen = 0.01;
    // muzzle flash and smoke
    const muzzle = new THREE.Vector3(dw.holder.position.x - dw.side * 0.9, 1.15, 0.1);
    this.flash.position.copy(muzzle);
    this.flash.visible = true;
    this.flashT = 0.12;
    this.fx.burst(muzzle, { count: 10, colors: ["#ffe14a", "#ffffff"], speed: 4, size: 0.12, life: 0.3, shape: "ball" });
    this.fx.burst({ x: muzzle.x - dw.side * 0.35, y: muzzle.y, z: muzzle.z + 0.3 }, { count: 5, colors: ["#d8d0c8", "#bcb4ac"], speed: 0.8, up: 0.6, gravity: -0.4, size: 0.16, sizeEnd: 0.32, life: 0.9, shape: "ball", drag: 2 });
    this.fx.dust({ x: dl.holder.position.x + dl.side * 0.6, y: 0, z: 0 }, 12, "#e8c890");
    this.sound("shoot");
    this.sound("hit");
    this.shake = 0.3;
    this.buzz(w, 60);
    this.buzz(l, [120, 40, 120]);
    const msTxt = `${Math.round(ms)} ms`;
    this.big(T(`${this.players[w].name}!<span class="sub">drew in ${msTxt}</span>`, `${this.players[w].name}！<span class="sub">拔枪 ${msTxt}</span>`), "pan");
    const el = this.hud.label(aw.root, msTxt, { dy: 2.1, cls: "dw-ms" });
    setTimeout(() => this.hud.removeLabel(el), 2800);
    this.sound("cheer");
    this.phase = "result";
    this.pt = 0;
  }

  protected outroStep(dt: number) {
    this.ambient(dt);
    this.duel.forEach((d) => {
      if (d.fallen > 0) {
        d.fallen = Math.min(1, d.fallen + dt * 2.2);
        d.holder.rotation.z = -d.side * (Math.PI / 2) * 0.92 * easeOutCubic(d.fallen);
      }
    });
  }

  protected celebrate(res: { place: number[] }) {
    this.avatars.forEach((a, i) => {
      const d = this.duel[i];
      if (res.place[i] === 1) {
        d.holder.rotation.z = 0;
        d.fallen = 0;
        a.anim = "win";
        a.yaw = 0;
      } else {
        a.anim = "lose";
        if (d.fallen === 0) d.fallen = 0.01;
      }
    });
    void music;
    void sfx;
  }
}

const def: MiniDef = {
  id: "duel-western",
  name: "High Noon",
  icon: "🤠",
  color: "#e0a050",
  tagline: "Draw on the signal… not before!",
  rules: "Wait for “BANG!” then press A as fast as you can. Shoot early (beware the fake calls!) and you lose the round. First to 3.",
  controls: { a: "Draw" },
  modes: ["duel"],
  length: 35,
  music: "tense",
  create: (ctx) => new DuelWestern(ctx),
};
export default def;
