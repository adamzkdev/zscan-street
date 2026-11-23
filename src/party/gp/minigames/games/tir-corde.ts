/**
 * TIR À LA CORDE (2 contre 2, 30 s): at a village fair, two teams pull a rope over a mud pit.
 * Mash A to pull (a team's strength = the sum of both players' cadence). Every few seconds a
 * « HISSEZ ! » ring closes in: B right on the beat gives a big tug (both teammates on the beat:
 * « SYNCHRO ! » bonus). Pull the rope's red flag past your team's mark to win: the losers slide
 * into the mud. After 30 s, the side the flag is on wins (centred: a draw).
 */
import * as THREE from "three";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef, MiniResult } from "../types";
import { GEO, ball, box, canvasTex, cloud, cone, cyl, flat, group, textSprite, toon, tree } from "../../engine/gfx";
import { clamp, damp } from "../../engine/util";
import { music } from "../../engine/audio";
import { T } from "../../../../i18n/lang";

const TIME = 30;
/** The flag must pass ±WIN (team 0's mark is on the left, at -WIN). */
const WIN = 1.8;
/** Distance from the rope's centre to each team's front / back puller. */
const FRONT = 2.9;
const GAP = 1.35;
const ROPE_Y = 0.74;
/** Rope speed (units/s) per press/s of difference between the teams. */
const K = 0.068;
/** Mash cadence estimator time constant (s). */
const TAU = 0.7;
/** The « HISSEZ ! » ring takes this long to close. */
const LEAD = 1.15;
const PERFECT = 0.09;
const GOOD = 0.21;
const TUG_PERFECT = 0.34;
const TUG_GOOD = 0.18;
const TUG_SYNC = 0.14;
const PIT_RX = 2.05;
const PIT_RZ = 1.7;
const TEAM_COL = ["#ff5a4e", "#3d8bff"];
const MUD = ["#6b4423", "#4f2f16", "#8a5a30"];

interface Puller {
  acc: number;
  rate: number;
  /** A press just happened (visual jolt, decays). */
  jolt: number;
  /** Lost balance (a missed HISSEZ): weaker for a moment. */
  slip: number;
  tried: boolean;
  grade: number;
  /** CPU: when it will press B for the current prompt (Infinity: it won't). */
  cpuAt: number;
  cpuPh: number;
  cpuB: number;
  /** CPU effort waves (each CPU tires and pushes at its own rhythm). */
  cpuF: number;
  cpuPh0: number;
}

interface Prompt {
  beat: number;
  hit: boolean;
  done: boolean;
}

class TirCorde extends BaseMini {
  private pl: Puller[] = [];
  /** The rope's offset along x (the flag's position): negative = toward team 0. */
  private d = 0;
  private vel = 0;
  /** Tugs still to apply (smoothly). */
  private pending = 0;
  private prompt: Prompt | null = null;
  private nextBeat = 3.6;
  private hurried = false;
  private rope!: THREE.Group;
  private flag!: THREE.Mesh;
  private crowd: { g: THREE.Object3D; ph: number; y: number }[] = [];
  private wheel!: THREE.Group;
  private gaugeFlag!: HTMLElement;
  private promptEl!: HTMLElement;
  private promptRing!: HTMLElement;
  private promptCore!: HTMLElement;
  private promptTxt!: HTMLElement;
  flashT = 0;
  private cheer = 0;
  private bars: HTMLElement[] = [];
  private bubbleT = 0;
  private winner: number | null = null;
  private outroT = 0;
  private sliders: { i: number; x0: number; x1: number; splashed: boolean }[] = [];

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#5db7ff", "#e4f6ff"], size: 12, sun: [0.4, 1, 0.6], fog: { near: 35, far: 90 } });
    this.buildFair();
    this.buildRope();
    this.players.forEach((p, i) => {
      const a = this.spawn(i, this.homeX(i), -0.12, this.homeYaw(i));
      a.setRing(p.char.color);
      a.root.rotation.order = "YXZ";
      a.anim = "hold";
      this.pl.push({ acc: 0, rate: 0, jolt: 0, slip: 0, tried: false, grade: 0, cpuAt: Infinity, cpuPh: Math.random(), cpuB: 0, cpuF: 0.45 + Math.random() * 0.4, cpuPh0: Math.random() * 6.3 });
    });
    const cards = this.hud.players(this.players, () => "", { teams: true });
    // team 0 on the left of the screen, team 1 on the right (like on the field)
    [...cards.children].forEach((c, i) => {
      c.classList.remove("tl", "tr", "bl", "br");
      c.classList.add(["tl", "bl", "tr", "br"][i]);
      const v = c.querySelector(".val") as HTMLElement;
      v.innerHTML = `<div style="width:calc(var(--u)*8);height:calc(var(--u)*1.3);margin-top:calc(var(--u)*0.4);border-radius:999px;background:rgba(255,255,255,.18);overflow:hidden"><div style="height:100%;width:0;border-radius:999px;background:${TEAM_COL[this.players[i].team]}"></div></div>`;
      this.bars.push(v.firstElementChild!.firstElementChild as HTMLElement);
    });
    this.buildHud();
    this.hud.timer(TIME);
    this.setCam([0, 9, 20], [0, 1, 0], 40);
  }

  // ------------------------------------------------------------ layout

  private side(i: number) {
    return this.players[i].team === 0 ? -1 : 1;
  }
  private homeX(i: number) {
    const front = i % 2 === 0;
    return this.side(i) * (FRONT + (front ? 0 : GAP)) + this.d;
  }
  private homeYaw(i: number) {
    // face the rope's centre, turned a bit toward the camera
    return this.side(i) < 0 ? Math.PI / 2 - 0.42 : -Math.PI / 2 + 0.42;
  }

  // ------------------------------------------------------------ the fair

  private buildFair() {
    const s = this.scene;
    // meadow and the trampled dirt arena
    const grass = new THREE.Mesh(new THREE.CircleGeometry(80, 48), toon("#8fd16a"));
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.02;
    grass.receiveShadow = true;
    s.add(grass);
    const dirtTex = canvasTex(512, 256, (g, w, h) => {
      g.fillStyle = "#d9b67c";
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 260; i++) {
        g.fillStyle = i % 3 ? "rgba(160,120,70,0.18)" : "rgba(255,240,200,0.25)";
        g.beginPath();
        g.ellipse(Math.random() * w, Math.random() * h, 4 + Math.random() * 14, 2 + Math.random() * 6, 0, 0, Math.PI * 2);
        g.fill();
      }
    });
    const dirt = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshToonMaterial({ map: dirtTex }));
    dirt.rotation.x = -Math.PI / 2;
    dirt.scale.set(9.5, 4.2, 1);
    dirt.position.y = 0.0;
    dirt.receiveShadow = true;
    s.add(dirt);
    // the mud pit: a dark glossy puddle with a raised rim and shiny patches
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.12, 8, 48), toon("#9a6a3a"));
    rim.rotation.x = -Math.PI / 2;
    rim.scale.set(PIT_RX + 0.05, PIT_RZ + 0.05, 1);
    rim.position.y = 0.03;
    rim.receiveShadow = true;
    s.add(rim);
    const mud = new THREE.Mesh(GEO.circle, toon("#6b4423", "#2a1405", 0.25));
    mud.rotation.x = -Math.PI / 2;
    mud.scale.set(PIT_RX, PIT_RZ, 1);
    mud.position.y = 0.035;
    mud.receiveShadow = true;
    s.add(mud);
    for (const [x, z, r] of [
      [-0.9, 0.5, 0.55],
      [0.7, -0.6, 0.45],
      [0.2, 0.9, 0.3],
      [-0.3, -0.8, 0.35],
      [1.2, 0.4, 0.28],
    ]) {
      const m = new THREE.Mesh(GEO.circle, toon("#4f2f16"));
      m.rotation.x = -Math.PI / 2;
      m.scale.set(r * 1.4, r, 1);
      m.position.set(x, 0.04, z);
      s.add(m);
      const shine = new THREE.Mesh(GEO.circle, flat("#c79a6a", 0.55));
      shine.rotation.x = -Math.PI / 2;
      shine.scale.set(r * 0.45, r * 0.18, 1);
      shine.position.set(x - r * 0.3, 0.045, z - r * 0.25);
      s.add(shine);
    }
    // the two marks: a chalk line and a team pennant on a stake
    for (const t of [0, 1]) {
      const x = (t === 0 ? -1 : 1) * WIN;
      for (let k = -3; k <= 3; k++) box(s, flat(k % 2 ? "#ffffff" : TEAM_COL[t]), 0.2, 0.03, 0.44, { x, y: 0.07, z: k * 0.46, cast: false });
      for (const z of [-PIT_RZ - 0.35]) {
        const st = group(s, { x, z });
        cyl(st, "#7a5030", 0.06, 2.0, { y: 1.0, seg: 8 });
        const pen = cone(st, TEAM_COL[t], 0.3, 0.8, { x: (t === 0 ? -1 : 1) * -0.4, y: 1.75, rz: ((t === 0 ? -1 : 1) * Math.PI) / 2 });
        pen.scale.z = 0.05;
        ball(st, "#ffd23f", 0.09, { y: 2.05 });
      }
    }
    // hay bales around the arena
    const hay = toon("#f2cf63");
    const hayEnd = toon("#e2b84a");
    for (const [x, z, ry] of [
      [-7.6, -2.6, 0.2],
      [-6.2, -3.2, 0],
      [7.4, -2.8, -0.2],
      [6, -3.3, 0.1],
      [-8.4, 1.6, 1.4],
      [8.6, 1.2, 1.7],
      [-6.9, -3.25, 0.1],
    ]) {
      const g = group(s, { x, y: 0.42, z, ry });
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 14), [hay, hayEnd, hayEnd]);
      c.rotation.z = Math.PI / 2;
      c.castShadow = c.receiveShadow = true;
      g.add(c);
      box(g, "#c9a24a", 0.05, 0.92, 0.92, { x: 0.25 });
      box(g, "#c9a24a", 0.05, 0.92, 0.92, { x: -0.25 });
    }
    // a wooden fence behind, with bunting
    const posts: THREE.Vector3[] = [];
    for (let i = 0; i <= 10; i++) {
      const x = -12 + i * 2.4;
      const z = -5.2 - Math.abs(x) * 0.08;
      cyl(s, "#a87a48", 0.1, 1.3, { x, y: 0.65, z, seg: 8 });
      if (i < 10) {
        const nx = x + 2.4,
          nz = -5.2 - Math.abs(nx) * 0.08;
        const mx = (x + nx) / 2,
          mz = (z + nz) / 2;
        const ry = -Math.atan2(nz - z, nx - x);
        box(s, "#c49058", 2.45, 0.12, 0.06, { x: mx, y: 0.95, z: mz, ry });
        box(s, "#c49058", 2.45, 0.12, 0.06, { x: mx, y: 0.5, z: mz, ry });
      }
      if (i % 2 === 0) {
        cyl(s, "#f4f4f4", 0.05, 3.6, { x, y: 1.8, z: z - 0.1, seg: 6 });
        posts.push(new THREE.Vector3(x, 3.5, z - 0.1));
      }
    }
    const bunt = ["#ff4b3e", "#ffd23f", "#3fcf5a", "#2f8dff", "#ff7ad9", "#ffffff"];
    for (let k = 0; k < posts.length - 1; k++) {
      const a = posts[k],
        b = posts[k + 1];
      for (let j = 1; j < 8; j++) {
        const t = j / 8;
        const p = a.clone().lerp(b, t);
        p.y -= Math.sin(t * Math.PI) * 0.55;
        const f = cone(s, bunt[(k * 7 + j) % bunt.length], 0.17, 0.34, { x: p.x, y: p.y - 0.17, z: p.z, rx: Math.PI, cast: false, lo: true });
        f.scale.z = 0.02;
      }
    }
    // the crowd behind the fence
    const shirts = ["#ff7a59", "#5ab0ff", "#ffd23f", "#7bd389", "#c78bff", "#ff9ad5", "#f4f4f4", "#5ad1c9"];
    const skins = ["#ffd2b0", "#e8b48a", "#c98d62", "#8a5a3a"];
    for (let i = 0; i < 18; i++) {
      const x = -10 + i * 1.18 + (i % 2) * 0.3;
      if (Math.abs(x) < 1.2) continue;
      const z = -6.3 - (i % 3) * 0.5 - Math.abs(x) * 0.08;
      const g = group(s, { x, z });
      const body = new THREE.Mesh(GEO.capsule, toon(shirts[i % shirts.length]));
      body.scale.set(0.55, 0.6, 0.45);
      body.position.y = 0.6;
      body.castShadow = true;
      g.add(body);
      ball(g, skins[i % skins.length], 0.24, { y: 1.18, lo: true });
      if (i % 3 === 0) cyl(g, i % 2 ? "#e8d27a" : "#3a3a4a", 0.26, 0.14, { y: 1.38, seg: 12 });
      ball(g, skins[i % skins.length], 0.08, { x: 0.3, y: 1.15, lo: true });
      ball(g, skins[i % skins.length], 0.08, { x: -0.3, y: 1.15, lo: true });
      this.crowd.push({ g, ph: Math.random() * 6, y: 0 });
    }
    // striped tents
    const stripe = canvasTex(256, 64, (g, w, h) => {
      for (let i = 0; i < 16; i++) {
        g.fillStyle = i % 2 ? "#ffffff" : "#e8403a";
        g.fillRect((i * w) / 16, 0, w / 16 + 1, h);
      }
    });
    const stripeB = canvasTex(256, 64, (g, w, h) => {
      for (let i = 0; i < 16; i++) {
        g.fillStyle = i % 2 ? "#ffffff" : "#2f7de0";
        g.fillRect((i * w) / 16, 0, w / 16 + 1, h);
      }
    });
    for (const [x, z, tex] of [
      [-12.5, -11, stripe],
      [11.5, -10.5, stripeB],
      [-5.5, -13.5, stripeB],
    ] as const) {
      const g = group(s, { x, z });
      const m = new THREE.MeshToonMaterial({ map: tex });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 2.4, 16, 1, true), m);
      body.position.y = 1.2;
      g.add(body);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(2.9, 2.2, 16), m);
      roof.position.y = 3.5;
      roof.castShadow = true;
      g.add(roof);
      cyl(g, "#ffd23f", 0.05, 0.8, { y: 4.9, seg: 6 });
      const fl = cone(g, "#ff4b3e", 0.2, 0.5, { x: 0.25, y: 5.1, rz: -Math.PI / 2 });
      fl.scale.z = 0.05;
      box(g, "#3a2418", 1.2, 1.8, 0.1, { y: 0.9, z: 2.38 });
    }
    // a big wheel turning in the distance
    this.wheel = group(s, { x: 9, y: 7.5, z: -18 });
    const rimW = new THREE.Mesh(new THREE.TorusGeometry(5.5, 0.16, 8, 48), toon("#ff6b9a"));
    this.wheel.add(rimW);
    const rim2 = new THREE.Mesh(new THREE.TorusGeometry(4.9, 0.08, 6, 48), toon("#ffffff"));
    this.wheel.add(rim2);
    const cabCols = ["#ffd23f", "#2f8dff", "#3fcf5a", "#ff4b3e", "#9b5cff", "#ff9a2e"];
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      box(this.wheel, "#ffffff", 0.1, 5.5, 0.1, { x: Math.cos(a) * 2.75, y: Math.sin(a) * 2.75, rz: a + Math.PI / 2 });
      ball(this.wheel, cabCols[k % 6], 0.45, { x: Math.cos(a) * 5.5, y: Math.sin(a) * 5.5 - 0.5, lo: true });
    }
    cyl(this.wheel, "#ddd", 0.4, 0.6, { rx: Math.PI / 2, seg: 12 });
    for (const sx of [-1, 1]) box(s, "#8a8fa8", 0.25, 8, 0.25, { x: 9 + sx * 2.2, y: 3.7, z: -18, rz: sx * 0.28 });
    // the village sign, on two posts by the hay bales
    const sg = group(s, { x: 7.3, z: -3.7, ry: -0.25 });
    for (const sx of [-1.1, 1.1]) cyl(sg, "#7a5030", 0.07, 2.2, { x: sx, y: 1.1, seg: 6 });
    const sign = textSprite(T("ZStreet Fair", "Z街集市"), 0.75, { color: "#fff", bg: "#a0522d", stroke: "#5a2a10" });
    sign.position.set(0, 1.85, 0.1);
    sg.add(sign);
    // trees and clouds
    for (let i = 0; i < 12; i++) {
      const x = -26 + i * 4.6 + (i % 2) * 1.3;
      if (Math.abs(x) < 4) continue;
      tree(s, x, -15 - (i % 3) * 3, 1.5 + (i % 3) * 0.4, i % 2 ? "#5cc44f" : "#48b04a");
    }
    tree(s, -15, -4, 1.8, "#4fbf4a");
    tree(s, 15.5, -3, 1.7, "#5cc44f");
    cloud(s, -14, 13, -30, 2.2);
    cloud(s, 6, 15, -34, 2.6);
    cloud(s, 22, 12, -28, 1.8);
  }

  private buildRope() {
    // one tube: from the ground behind team 0, up to the hands, across, down behind team 1
    const L = FRONT + GAP;
    const pts = [
      new THREE.Vector3(-L - 2.2, 0.06, 0.5),
      new THREE.Vector3(-L - 1.3, 0.1, 0.2),
      new THREE.Vector3(-L - 0.5, ROPE_Y - 0.1, 0),
      new THREE.Vector3(-L, ROPE_Y, 0),
      new THREE.Vector3(0, ROPE_Y, 0),
      new THREE.Vector3(L, ROPE_Y, 0),
      new THREE.Vector3(L + 0.5, ROPE_Y - 0.1, 0),
      new THREE.Vector3(L + 1.3, 0.1, 0.2),
      new THREE.Vector3(L + 2.2, 0.06, 0.5),
    ];
    const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.2);
    const ropeTex = canvasTex(64, 256, (g, w, h) => {
      g.fillStyle = "#d8b27a";
      g.fillRect(0, 0, w, h);
      g.strokeStyle = "#a87a40";
      g.lineWidth = 7;
      for (let y = -w; y < h + w; y += 18) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y + w * 0.7);
        g.stroke();
      }
    }, true);
    ropeTex.repeat.set(1, 30);
    this.rope = group(this.scene);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 0.075, 8), new THREE.MeshToonMaterial({ map: ropeTex }));
    tube.castShadow = true;
    this.rope.add(tube);
    // the flag in the middle
    const flagGeo = new THREE.PlaneGeometry(0.5, 0.65);
    flagGeo.translate(0, -0.33, 0);
    this.flag = new THREE.Mesh(flagGeo, new THREE.MeshToonMaterial({ color: "#ff3030", side: THREE.DoubleSide, emissive: "#600000" }));
    this.flag.position.set(0, ROPE_Y - 0.02, 0);
    this.flag.castShadow = true;
    this.rope.add(this.flag);
    ball(this.rope, "#ffffff", 0.11, { y: ROPE_Y });
    // knots marking each team's grip zone
    for (const sx of [-1, 1]) for (const k of [FRONT - 0.3, FRONT + GAP - 0.3]) ball(this.rope, "#a87a40", 0.1, { x: sx * k, y: ROPE_Y });
  }

  private buildHud() {
    const u = (n: number) => `calc(var(--u)*${n})`;
    const box = this.hud.add(
      `<div style="position:absolute;left:50%;top:${u(8)};transform:translateX(-50%);display:flex;align-items:center;gap:${u(1)}">
        <div style="font-family:var(--title);font-size:${u(2)};color:${TEAM_COL[0]};-webkit-text-stroke:${u(0.25)} #1d1630;paint-order:stroke fill;white-space:nowrap">${T("SHIELDED", "屏蔽")}</div>
        <div class="tc-bar" style="position:relative;width:${u(40)};height:${u(2.6)};border-radius:999px;border:${u(0.35)} solid #1d1630;background:linear-gradient(90deg,${TEAM_COL[0]} 0 50%,${TEAM_COL[1]} 50% 100%);box-shadow:0 ${u(0.4)} 0 rgba(0,0,0,.3)">
          <div style="position:absolute;left:50%;top:-${u(0.6)};bottom:-${u(0.6)};width:${u(0.3)};background:#fff;transform:translateX(-50%);opacity:.8"></div>
          <div class="tc-flag" style="position:absolute;left:50%;top:50%;width:${u(3.6)};height:${u(3.6)};transform:translate(-50%,-50%);border-radius:50%;background:#fff;border:${u(0.35)} solid #1d1630;display:grid;place-items:center;font-size:${u(2)}">🚩</div>
        </div>
        <div style="font-family:var(--title);font-size:${u(2)};color:${TEAM_COL[1]};-webkit-text-stroke:${u(0.25)} #1d1630;paint-order:stroke fill;white-space:nowrap">${T("TRANSPARENT", "透明")}</div>
      </div>`,
    );
    this.gaugeFlag = box.querySelector(".tc-flag") as HTMLElement;
    this.promptEl = this.hud.add(
      `<div style="position:absolute;left:50%;top:${u(18)};transform:translate(-50%,-50%);width:${u(10)};height:${u(10)}">
        <div class="pr-ring" style="position:absolute;inset:0;border-radius:50%;border:${u(0.7)} solid #fff;box-shadow:0 0 ${u(1)} rgba(255,255,255,.6)"></div>
        <div class="pr-core" style="position:absolute;inset:${u(1.6)};border-radius:50%;background:#ff4b3e;border:${u(0.45)} solid #1d1630;display:grid;place-items:center;font-family:var(--title);font-size:${u(3.6)};color:#fff;box-shadow:0 ${u(0.4)} 0 rgba(0,0,0,.35)">B</div>
        <div class="pr-txt" style="position:absolute;left:50%;top:100%;transform:translateX(-50%);margin-top:${u(0.6)};font-family:var(--title);font-size:${u(3.4)};white-space:nowrap;color:#fff;-webkit-text-stroke:${u(0.3)} #1d1630;paint-order:stroke fill">${T("READY…", "预备……")}</div>
      </div>`,
    ).firstElementChild as HTMLElement;
    this.promptRing = this.promptEl.querySelector(".pr-ring") as HTMLElement;
    this.promptCore = this.promptEl.querySelector(".pr-core") as HTMLElement;
    this.promptTxt = this.promptEl.querySelector(".pr-txt") as HTMLElement;
    this.promptEl.style.display = "none";
  }

  // ------------------------------------------------------------ CPUs

  protected cpu(i: number, dt: number): CpuPad {
    const me = this.pl[i];
    const lv = this.players[i].level;
    // mash: 5.2 (beginner) … 8.6 (expert) presses a second, with waves of effort
    const wave = 1 + 0.12 * Math.sin(this.t * me.cpuF + me.cpuPh0);
    const late = this.t > TIME - 10 ? 1 + 0.1 * lv : 1;
    me.cpuPh += (5.2 + 3.4 * lv) * wave * late * dt;
    const a = me.cpuPh % 1 < 0.5;
    let b = false;
    if (this.prompt && !this.prompt.done && !me.tried) {
      if (me.cpuAt === Infinity && me.cpuB === 0) {
        me.cpuB = 1; // planned
        const miss = 0.28 - 0.24 * lv;
        if (Math.random() >= miss) {
          const g = (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;
          me.cpuAt = this.prompt.beat + g * (0.2 - 0.15 * lv) + 0.01;
        }
      }
      if (this.t >= me.cpuAt) b = true;
    }
    return { a, b };
  }

  // ------------------------------------------------------------ the game

  start() {
    this.nextBeat = 3.6;
  }

  protected idle(dt: number) {
    this.moveCam(this.camTarget(), [this.d * 0.35, 1, 0], dt, 1.5);
    this.animateWorld(dt, 0.3);
    this.poseAvatars(dt);
  }

  private camTarget(): [number, number, number] {
    return [this.d * 0.35, 4.0, 11.2];
  }

  protected step(dt: number) {
    const left = TIME - this.t;
    this.hud.timer(left);
    if (!this.hurried && left <= 10) {
      this.hurried = true;
      this.hud.banner(T("10 SECONDS LEFT!", "还剩 10 秒！"), { color: "#ffd23f", sub: T("Everybody pull!", "大家一起拉！") });
      music.speed(1.15);
      this.sound("bell");
    }
    // mashing → cadence
    const decay = Math.exp(-dt / TAU);
    this.pl.forEach((p, i) => {
      const pad = this.pad(i);
      p.acc *= decay;
      if (pad.aDown) {
        p.acc += 1;
        p.jolt = 1;
        if (Math.random() < 0.25) this.fx.dust(this.avatars[i].pos, 2, "#d9b67c");
      }
      p.rate = Math.min(13, p.acc / TAU);
      // big efforts make you sweat
      if (p.rate > 7 && Math.random() < dt * (p.rate - 6) * 0.6) {
        const a = this.avatars[i];
        this.fx.burst({ x: a.pos.x, y: 1.75, z: a.pos.z }, { count: 2, colors: ["#bfe8ff", "#ffffff"], speed: 1.4, up: 2, gravity: 9, size: 0.07, sizeEnd: 0.02, life: 0.5, shape: "ball" });
      }
      p.jolt = Math.max(0, p.jolt - dt * 6);
      p.slip = Math.max(0, p.slip - dt);
    });
    // the HISSEZ prompts
    this.stepPrompt();
    // forces → rope
    const force = [0, 0];
    this.pl.forEach((p, i) => (force[this.players[i].team] += p.rate * (p.slip > 0 ? 0.45 : 1)));
    const ramp = 0.65 + Math.max(0, this.t - 6) / 10;
    const target = (force[1] - force[0]) * K * ramp;
    this.vel = damp(this.vel, target, 2.4, dt);
    const kick = this.pending * (1 - Math.exp(-7 * dt));
    this.pending -= kick;
    this.d += this.vel * dt + kick;
    this.d = clamp(this.d, -WIN - 0.3, WIN + 0.3);
    this.cheer = damp(this.cheer, Math.min(1, Math.abs(this.vel) * 3 + Math.abs(kick) * 30 + (this.hurried ? 0.4 : 0)), 3, dt);
    // HUD
    this.gaugeFlag.style.left = `${50 + clamp(this.d / WIN, -1, 1) * 50}%`;
    this.pl.forEach((p, i) => (this.bars[i].style.width = `${clamp(p.rate / 11, 0, 1) * 100}%`));
    this.moveCam(this.camTarget(), [this.d * 0.35, 1, 0], dt, 2.5);
    this.animateWorld(dt, this.cheer);
    this.poseAvatars(dt);
    // the end
    if (this.d <= -WIN) this.end(0);
    else if (this.d >= WIN) this.end(1);
    else if (left <= 0) this.end(Math.abs(this.d) < 0.06 ? null : this.d < 0 ? 0 : 1);
  }

  private stepPrompt() {
    const t = this.t;
    if (!this.prompt && t >= this.nextBeat - LEAD) {
      this.prompt = { beat: this.nextBeat, hit: false, done: false };
      this.pl.forEach((p) => {
        p.tried = false;
        p.grade = 0;
        p.cpuAt = Infinity;
        p.cpuB = 0;
      });
      this.promptEl.style.display = "";
      this.promptTxt.textContent = T("READY…", "预备……");
      this.promptCore.style.background = "#ff4b3e";
      this.sound("tick");
    }
    const pr = this.prompt;
    if (pr) {
      const k = (pr.beat - t) / LEAD;
      this.promptRing.style.transform = `scale(${Math.max(0.72, 1 + 1.8 * k)})`;
      this.promptRing.style.opacity = String(clamp(1.2 - Math.abs(k) * 0.4, 0, 1));
      if (!pr.hit && t >= pr.beat) {
        pr.hit = true;
        this.promptTxt.textContent = T("HEAVE!", "用力！");
        this.promptCore.style.background = "#ffc928";
        this.sound("drum");
      }
      if (pr.hit) {
        const f = (t - pr.beat) / 0.35;
        this.promptEl.style.transform = `translate(-50%,-50%) scale(${1 + 0.18 * Math.max(0, 1 - f)})`;
      } else this.promptEl.style.transform = "translate(-50%,-50%)";
      // presses
      this.pl.forEach((p, i) => {
        if (p.tried || !this.pad(i).bDown) return;
        p.tried = true;
        const e = Math.abs(t - pr.beat);
        p.grade = e <= PERFECT ? 2 : e <= GOOD ? 1 : 0;
        this.grade(i, p.grade);
      });
      if (t > pr.beat + 0.38) {
        pr.done = true;
        this.prompt = null;
        this.promptEl.style.display = "none";
        const gap = this.hurried ? 3 + this.rnd() * 0.8 : 4.2 + this.rnd() * 1.4;
        this.nextBeat = pr.beat + gap;
      }
    }
  }

  private grade(i: number, g: number) {
    const a = this.avatars[i];
    const team = this.players[i].team;
    const head = a.pos.clone().add(new THREE.Vector3(0, 2.1, 0));
    if (g === 0) {
      this.pl[i].slip = 0.7;
      this.hud.pop(head, T("MISS…", "失误……"), "#c8c8d8", this.camera);
      this.sound("wrong");
      this.buzz(i, [30, 30, 30]);
      return;
    }
    const dir = team === 0 ? -1 : 1;
    let tug = g === 2 ? TUG_PERFECT : TUG_GOOD;
    this.hud.pop(head, g === 2 ? T("PERFECT!", "完美！") : T("GOOD!", "不错！"), g === 2 ? "#ffe14a" : "#7dff8a", this.camera);
    // the teammate already hit: synchro bonus
    const mate = this.pl.findIndex((_, j) => j !== i && this.players[j].team === team);
    if (mate >= 0 && this.pl[mate].tried && this.pl[mate].grade > 0) {
      tug += TUG_SYNC;
      this.hud.banner(T("IN SYNC!", "同步！"), { color: TEAM_COL[team], size: 6, ms: 700 });
      this.sound("power");
    }
    this.pending += dir * tug;
    this.pl[i].jolt = 1.6;
    this.sound(g === 2 ? "hit" : "whoosh");
    this.shake = g === 2 ? 0.25 : 0.12;
    this.buzz(i, g === 2 ? 70 : 40);
    this.fx.dust(a.pos, 8, "#d9b67c");
    if (g === 2) this.fx.sparkle(new THREE.Vector3(a.pos.x, 1.2, a.pos.z), "#ffe14a", 10);
  }

  private end(w: number | null) {
    if (this.finished) return;
    this.winner = w;
    this.promptEl.style.display = "none";
    this.finishByTeam(w);
  }

  // ------------------------------------------------------------ animation

  private animateWorld(dt: number, excite: number) {
    this.wheel.rotation.z += dt * 0.12;
    for (const c of this.crowd) {
      c.ph += dt * (5 + 5 * excite);
      c.g.position.y = Math.abs(Math.sin(c.ph)) * (0.06 + 0.3 * excite);
    }
    this.rope.position.x = this.d;
    const tension = this.pl.reduce((s, p) => s + p.jolt, 0);
    this.rope.position.y = Math.sin(this.t * 40) * 0.008 * tension;
    this.flag.rotation.y = Math.sin(this.t * 3) * 0.4 + this.vel * 2;
    this.flag.rotation.x = Math.sin(this.t * 5.3) * 0.15;
    this.bubbleT -= dt;
    if (this.bubbleT <= 0) {
      this.bubbleT = 0.4 + Math.random() * 0.8;
      const a = Math.random() * Math.PI * 2,
        r = Math.sqrt(Math.random()) * 0.8;
      this.fx.burst({ x: Math.cos(a) * r * PIT_RX, y: 0.08, z: Math.sin(a) * r * PIT_RZ }, { count: 3, colors: MUD, speed: 0.6, up: 1.2, gravity: 6, size: 0.1, sizeEnd: 0, life: 0.5, shape: "ball" });
    }
  }

  /** Pullers: positions follow the rope, lean back with their effort. */
  private poseAvatars(dt: number) {
    if (this.finished) return;
    this.players.forEach((_, i) => {
      const a = this.avatars[i];
      const p = this.pl[i];
      const sd = this.side(i);
      a.pos.x = this.homeX(i);
      a.pos.z = -0.12;
      a.yaw = this.homeYaw(i);
      a.anim = "hold";
      // lean back with the cadence, lurch forward when the rope goes the other way
      const pulledAway = -sd * this.vel; // > 0: the rope is going toward the other team
      const lean = 0.18 + p.rate * 0.03 + p.jolt * 0.12 - Math.max(0, pulledAway) * 0.8 - (p.slip > 0 ? 0.25 : 0);
      a.root.rotation.x = damp(a.root.rotation.x, -clamp(lean, -0.2, 0.62), 10, dt);
    });
  }

  /** After the avatars' own animation: brace the legs and grip the rope. */
  private rig() {
    this.avatars.forEach((a, i) => {
      if (a.anim !== "hold") return;
      const r = a.rig;
      const p = this.pl[i];
      const step = Math.sin(this.t * 14 + i) * 0.12 * Math.min(1, p.rate / 6);
      r.legL.rotation.x = -0.75 + step;
      r.legR.rotation.x = 0.35 - step;
      r.armL.rotation.x = -1.25 - p.jolt * 0.15;
      r.armR.rotation.x = -1.25 - p.jolt * 0.15;
      r.armL.rotation.z = 0.25;
      r.armR.rotation.z = -0.25;
      r.head.rotation.x = -0.15;
    });
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

  // ------------------------------------------------------------ the ending

  protected celebrate(res: MiniResult) {
    this.sliders = [];
    this.avatars.forEach((a, i) => {
      a.root.rotation.x = 0;
      if (this.winner === null) {
        a.anim = "lose";
        return;
      }
      if (res.place[i] === 1) {
        a.anim = "win";
      } else {
        a.anim = "fall";
        const sd = this.side(i);
        const front = i % 2 === 0;
        this.sliders.push({ i, x0: a.pos.x, x1: sd * (front ? 0.45 : 1.35), splashed: false });
      }
    });
    if (this.winner !== null) this.sound("slide");
  }

  protected outroStep(dt: number) {
    this.outroT += dt;
    this.animateWorld(dt, 1);
    if (this.winner !== null) {
      // the rope flies to the winners
      const dir = this.winner === 0 ? -1 : 1;
      this.d = damp(this.d, dir * (WIN + 1.2), 3, dt);
      this.players.forEach((p, i) => {
        if (p.team !== this.winner) return;
        const a = this.avatars[i];
        a.pos.x = damp(a.pos.x, this.homeX(i), 6, dt);
        a.face(0, dt, 4);
      });
    }
    for (const s of this.sliders) {
      const a = this.avatars[s.i];
      const k = clamp(this.outroT / 0.55, 0, 1);
      a.pos.x = s.x0 + (s.x1 - s.x0) * (1 - (1 - k) * (1 - k));
      a.pos.y = k < 1 ? Math.sin(k * Math.PI) * 0.5 : damp(a.pos.y, -0.28, 4, dt);
      a.root.rotation.x = damp(a.root.rotation.x, k < 1 ? 0.9 : 0.25, 8, dt);
      if (k >= 1 && !s.splashed) {
        s.splashed = true;
        a.anim = "swim";
        this.fx.burst({ x: a.pos.x, y: 0.2, z: a.pos.z }, { count: 34, colors: MUD, speed: 4.5, up: 6, gravity: 16, size: 0.2, sizeEnd: 0.06, life: 0.9, shape: "ball", drag: 0.5 });
        this.fx.ring({ x: a.pos.x, y: 0.05, z: a.pos.z }, "#8a5a30", 1.8, 0.5);
        this.sound("splash");
        this.shake = 0.3;
        // mud splotches on the loser
        for (let k2 = 0; k2 < 6; k2++) {
          const m = ball(a.model, MUD[k2 % 3], 0.09 + Math.random() * 0.07, { x: (Math.random() - 0.5) * 0.6, y: 0.4 + Math.random() * 1.0, z: 0.18 + Math.random() * 0.12, lo: true, cast: false });
          m.scale.z *= 0.5;
        }
      }
      if (s.splashed && this.outroT > 1.6) a.anim = "lose";
    }
    this.moveCam([this.d * 0.2, 3.6, 10.5], [this.d * 0.2, 0.8, 0], dt, 2);
  }
}

const def: MiniDef = {
  id: "tir-corde",
  name: "Tug of War",
  icon: "🪢",
  color: "#c98a4a",
  tagline: "Pull together and drag the other team into the mud.",
  rules: "Mash A to pull with your teammate. At “HEAVE!”, press B as the ring closes. Bring the flag to your mark!",
  controls: { a: "Pull", b: "Heave! (on the beat)", mash: true },
  modes: ["2v2"],
  length: 30,
  music: "mini2",
  create: (ctx) => new TirCorde(ctx),
};
export default def;
