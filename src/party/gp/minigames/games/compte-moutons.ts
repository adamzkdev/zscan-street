/**
 * COMPTE LES MOUTONS (chacun pour soi, 3 manches): in a sunny meadow, sheep run across and leap a
 * fence in bursts, mixed (from round 2) with pigs and goats that must NOT be counted. Then a dial
 * of 8 numbers appears: everyone secretly HOLDS the stick toward their answer; when the time runs
 * out the answers are revealed with the real count. Exact = 2 points, otherwise the closest = 1.
 */
import * as THREE from "three";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef } from "../types";
import { ball, box, canvasTex, cloud, cone, cyl, flat, group, pine, toon, tree } from "../../engine/gfx";
import { clamp, easeOutBack, lerp } from "../../engine/util";
import { STAR } from "../../engine/hud";
import { T } from "../../../../i18n/lang";
import { sfx, music } from "../../engine/audio";

type Kind = "sheep" | "pig" | "goat";

const ROUNDS = [
  { sheep: [8, 11], decoys: [0, 0], speed: 4.6, burst: [1, 2], gap: [0.55, 1.0] },
  { sheep: [12, 16], decoys: [3, 5], speed: 5.4, burst: [1, 3], gap: [0.45, 0.9] },
  { sheep: [16, 21], decoys: [5, 8], speed: 6.4, burst: [2, 4], gap: [0.35, 0.8] },
];
const PICK = 6;
const X0 = -14;
const X1 = 14;
const JUMP = 1.7; // half-width of the jump arc around the fence (x = 0)
const BALE_Z = 5.6;

interface Animal {
  kind: Kind;
  g: THREE.Group;
  legs: THREE.Object3D[];
  head: THREE.Object3D;
  x: number;
  z: number;
  v: number;
  at: number;
  ph: number;
  jumped: boolean;
  landed: boolean;
  alive: boolean;
  spawned: boolean;
}

/** The 8 stick directions, clockwise from up (dx, dy with y down). */
const DIRS: [number, number][] = [
  [0, -1],
  [0.7071, -0.7071],
  [1, 0],
  [0.7071, 0.7071],
  [0, 1],
  [-0.7071, 0.7071],
  [-1, 0],
  [-0.7071, -0.7071],
];

class CompteMoutons extends BaseMini {
  private round = -1;
  private phase: "wait" | "intro" | "run" | "pick" | "reveal" | "done" = "wait";
  private pt = 0;
  private animals: Animal[] = [];
  private tpl: Record<Kind, THREE.Group>;
  private count = 0;
  private lo = 0;
  private scores: number[] = [];
  private held: (number | null)[] = [];
  private picks: (number | null)[] = [];
  private cpuSlot: number[] = [];
  private cpuAt: number[] = [];
  private labels: (HTMLElement | null)[] = [];
  private dial: HTMLElement | null = null;
  private counter: HTMLElement | null = null;
  private shownCount = -1;
  private lastTick = -1;
  private lastJump = 0;
  private mill!: THREE.Group;

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#5aa8ff", "#fff0c8"], size: 16, sun: [-0.4, 1, 0.55], fog: { near: 45, far: 110 } });
    this.tpl = { sheep: this.makeSheep(), pig: this.makePig(), goat: this.makeGoat() };
    this.buildMeadow();
    const xs = [-5.4, -1.8, 1.8, 5.4];
    this.players.forEach((p, i) => {
      // a hay bale each, at the front
      const bx = xs[i];
      cyl(this.scene, "#e8c25a", 0.75, 1.3, { x: bx, y: 0.75, z: BALE_Z, rz: Math.PI / 2, seg: 18 });
      for (const k of [-0.35, 0.35]) cyl(this.scene, "#b8862a", 0.77, 0.06, { x: bx + k, y: 0.75, z: BALE_Z, rz: Math.PI / 2, seg: 18, cast: false });
      const a = this.spawn(i, bx, BALE_Z, Math.PI);
      a.pos.y = 1.45;
      a.groundY = 1.45;
      a.anim = "sit";
      a.setRing(p.char.color);
      this.scores.push(0);
      this.held.push(null);
      this.picks.push(null);
      this.cpuSlot.push(0);
      this.cpuAt.push(0);
      this.labels.push(null);
    });
    this.hud.add(
      `<style>
      .cm-dial{position:absolute;left:50%;top:38.5%;width:calc(var(--u)*24);height:calc(var(--u)*24);transform:translate(-50%,-50%);animation:cmin .4s cubic-bezier(.2,1.5,.4,1)}
      .cm-dial .ring{position:absolute;inset:calc(var(--u)*3);border-radius:50%;background:rgba(255,250,240,.92);border:calc(var(--u)*.5) solid #1d1630;box-shadow:0 calc(var(--u)*.8) 0 rgba(0,0,0,.3)}
      .cm-dial .mid{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);text-align:center;color:#1d1630;font-family:var(--title);font-size:calc(var(--u)*2.2);line-height:1.05}
      .cm-dial .mid b{display:block;font-size:calc(var(--u)*3.9)}
      .cm-dial .n{position:absolute;width:calc(var(--u)*5.8);height:calc(var(--u)*5.8);margin:calc(var(--u)*-2.9) 0 0 calc(var(--u)*-2.9);border-radius:50%;display:grid;place-items:center;font-family:var(--title);font-size:calc(var(--u)*3.1);color:#fff;background:#2f8dff;border:calc(var(--u)*.4) solid #1d1630;box-shadow:0 calc(var(--u)*.4) 0 rgba(0,0,0,.3)}
      .cm-dial .n:nth-child(odd){background:#ff7a3e}
      .cm-dial .n.hit{background:#3fcf5a;transform:scale(1.25);transition:transform .25s}
      .cm-dial.out{opacity:0;transform:translate(-50%,-50%) scale(.6);transition:all .35s}
      @keyframes cmin{0%{transform:translate(-50%,-50%) scale(.2);opacity:0}100%{transform:translate(-50%,-50%) scale(1);opacity:1}}
      .cm-q{font-family:var(--title);font-size:calc(var(--u)*2.4)!important;min-width:calc(var(--u)*4);text-align:center;border:calc(var(--u)*.3) solid var(--pc,#fff)}
      .cm-q.ok{background:#2fbf5a!important}
      .cm-q.ans{background:#fffaf0!important;color:#1d1630!important;font-size:calc(var(--u)*3)!important}
      .cm-q.exact{background:#3fcf5a!important;color:#fff!important;transform:scale(1.15)}
      .cm-q.close{background:#ffd23f!important;color:#1d1630!important}
      .cm-q.far{opacity:.75}
      .cm-count{position:absolute;left:50%;top:40%;transform:translate(-50%,-50%);text-align:center;font-family:var(--title);color:#fff;-webkit-text-stroke:calc(var(--u)*.35) #1d1630;paint-order:stroke fill;text-shadow:0 calc(var(--u)*.6) 0 rgba(0,0,0,.35)}
      .cm-count .v{font-size:calc(var(--u)*13);line-height:1}
      .cm-count .l{font-size:calc(var(--u)*3)}
      </style>`,
    );
    this.hud.players(this.players, () => `${STAR} 0`);
    this.setCam([0, 14, 26], [0, 1, -1], 42);
  }

  // ------------------------------------------------------------ animals (built once, cloned)

  private leg(parent: THREE.Object3D, x: number, z: number, h: number, r: number, color: string) {
    const g = group(parent, { x, y: h, z });
    cyl(g, color, r, h, { y: -h / 2, seg: 6 });
    return g;
  }

  private makeSheep() {
    const g = new THREE.Group();
    const wool = toon("#ffffff", "#d8e4ff", 0.15);
    ball(g, wool, [0.62, 0.48, 0.45], { y: 0.78 });
    ball(g, wool, 0.34, { x: 0.32, y: 0.98, z: 0.15, lo: true });
    ball(g, wool, 0.34, { x: -0.3, y: 0.98, z: -0.12, lo: true });
    const head = group(g, { x: 0.62, y: 0.98 });
    ball(head, "#2a2433", [0.26, 0.22, 0.2], { x: 0.1 });
    ball(head, wool, 0.17, { y: 0.17, x: 0.02, lo: true });
    ball(head, "#2a2433", [0.06, 0.14, 0.05], { y: 0.05, z: 0.22, rx: 0.6, lo: true });
    ball(head, "#2a2433", [0.06, 0.14, 0.05], { y: 0.05, z: -0.22, rx: -0.6, lo: true });
    ball(head, "#ffffff", 0.05, { x: 0.25, y: 0.06, z: 0.11, cast: false, lo: true });
    ball(head, "#ffffff", 0.05, { x: 0.25, y: 0.06, z: -0.11, cast: false, lo: true });
    for (const [x, z] of [
      [0.36, 0.2],
      [0.36, -0.2],
      [-0.36, 0.2],
      [-0.36, -0.2],
    ])
      this.leg(g, x, z, 0.5, 0.06, "#2a2433");
    return g;
  }

  private makePig() {
    const g = new THREE.Group();
    const pink = "#ff9cb4";
    ball(g, pink, [0.62, 0.42, 0.42], { y: 0.62 });
    const head = group(g, { x: 0.58, y: 0.74 });
    ball(head, pink, 0.3, { x: 0.05 });
    cyl(head, "#ff7d9c", 0.13, 0.12, { x: 0.32, rz: Math.PI / 2, seg: 12 });
    ball(head, "#9a3a5a", 0.03, { x: 0.39, y: 0.03, z: 0.05, cast: false, lo: true });
    ball(head, "#9a3a5a", 0.03, { x: 0.39, y: 0.03, z: -0.05, cast: false, lo: true });
    ball(head, "#1d1630", 0.045, { x: 0.27, y: 0.12, z: 0.13, cast: false, lo: true });
    ball(head, "#1d1630", 0.045, { x: 0.27, y: 0.12, z: -0.13, cast: false, lo: true });
    cone(head, pink, 0.11, 0.2, { y: 0.28, z: 0.15, rx: 0.5, lo: true });
    cone(head, pink, 0.11, 0.2, { y: 0.28, z: -0.15, rx: -0.5, lo: true });
    const tail = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.025, 6, 12), toon(pink));
    tail.position.set(-0.62, 0.75, 0);
    g.add(tail);
    for (const [x, z] of [
      [0.32, 0.2],
      [0.32, -0.2],
      [-0.32, 0.2],
      [-0.32, -0.2],
    ])
      this.leg(g, x, z, 0.36, 0.08, "#f07a98");
    return g;
  }

  private makeGoat() {
    const g = new THREE.Group();
    const fur = "#c9a27a";
    ball(g, fur, [0.56, 0.36, 0.34], { y: 0.86 });
    ball(g, "#f2e6d4", [0.4, 0.2, 0.3], { y: 0.72, x: 0.1, lo: true });
    const head = group(g, { x: 0.55, y: 1.15 });
    ball(head, fur, [0.24, 0.2, 0.18], { x: 0.12, rz: -0.4 });
    ball(head, "#f2e6d4", [0.12, 0.08, 0.1], { x: 0.3, y: -0.1, lo: true });
    cone(head, "#5a4a3a", 0.06, 0.34, { x: -0.02, y: 0.25, z: 0.08, rz: 0.5, lo: true });
    cone(head, "#5a4a3a", 0.06, 0.34, { x: -0.02, y: 0.25, z: -0.08, rz: 0.5, lo: true });
    cone(head, "#f2e6d4", 0.06, 0.22, { x: 0.22, y: -0.26, rz: Math.PI, lo: true });
    ball(head, "#1d1630", 0.04, { x: 0.22, y: 0.07, z: 0.12, cast: false, lo: true });
    ball(head, "#1d1630", 0.04, { x: 0.22, y: 0.07, z: -0.12, cast: false, lo: true });
    for (const [x, z] of [
      [0.32, 0.16],
      [0.32, -0.16],
      [-0.32, 0.16],
      [-0.32, -0.16],
    ])
      this.leg(g, x, z, 0.62, 0.055, "#7a5a3a");
    return g;
  }

  private spawnAnimal(a: Animal) {
    const g = this.tpl[a.kind].clone();
    this.scene.add(g);
    a.g = g;
    a.head = g.children.find((c) => c instanceof THREE.Group && c.children.length > 3) ?? g;
    a.legs = g.children.filter((c) => c instanceof THREE.Group && c !== a.head);
    a.spawned = true;
  }

  // ------------------------------------------------------------ the meadow

  private buildMeadow() {
    const s = this.scene;
    const grassTex = canvasTex(
      256,
      256,
      (g, w) => {
        g.fillStyle = "#7fcf5a";
        g.fillRect(0, 0, w, w);
        for (let i = 0; i < 220; i++) {
          g.fillStyle = i % 3 ? "#8ad866" : "#6fbf4e";
          const x = (i * 97) % w,
            y = (i * 61 + (i % 7) * 13) % w;
          g.fillRect(x, y, 3, 9);
        }
      },
      true,
    );
    grassTex.repeat.set(16, 16);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshToonMaterial({ map: grassTex }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    s.add(ground);
    // a worn dirt track along the run
    const track = new THREE.Mesh(new THREE.PlaneGeometry(40, 6.4), toon("#c9b07a"));
    track.rotation.x = -Math.PI / 2;
    track.position.set(0, 0.01, -1.1);
    track.receiveShadow = true;
    s.add(track);
    // the fence the animals jump (along z, at x = 0)
    const wood = "#a8743f";
    for (let z = -5.5; z <= 3.6; z += 1.3) {
      box(s, wood, 0.22, 1.25, 0.22, { x: 0, y: 0.62, z });
      cone(s, wood, 0.16, 0.18, { x: 0, y: 1.33, z, lo: true, ry: Math.PI / 4 });
    }
    for (const y of [0.55, 1.0]) box(s, "#c48a4f", 0.12, 0.16, 9.6, { x: 0, y, z: -0.95 });
    // back fence along the field
    for (let x = -20; x <= 20; x += 2.5) box(s, wood, 0.18, 1.1, 0.18, { x, y: 0.55, z: -7.5 });
    for (const y of [0.45, 0.9]) box(s, "#c48a4f", 41, 0.12, 0.1, { y, z: -7.5 });
    // rolling hills
    const hillCols = ["#6cc24a", "#5ab544", "#79cc55"];
    for (let i = 0; i < 7; i++) {
      const x = -36 + i * 12 + (i % 2) * 3;
      const r = 9 + (i % 3) * 3;
      ball(s, hillCols[i % 3], [r, r * 0.45, r * 0.7], { x, y: -1, z: -26 - (i % 2) * 6, lo: true, cast: false });
    }
    // a red barn and a windmill
    const barn = group(s, { x: -13, z: -13, ry: 0.35 });
    box(barn, "#d8402c", 6, 4, 4.5, { y: 2 });
    for (const sx of [-1, 1]) box(barn, "#5a3a2a", 3.7, 0.3, 5.0, { x: sx * 1.45, y: 4.95, rz: -sx * 0.62 });
    box(barn, "#d8402c", 4.2, 1.6, 4.4, { y: 4.4, cast: false });
    box(barn, "#ffffff", 2, 2.6, 0.1, { y: 1.3, z: 2.27 });
    box(barn, "#8a2418", 1.7, 2.3, 0.12, { y: 1.2, z: 2.3 });
    box(barn, "#ffffff", 0.14, 2.4, 0.14, { y: 1.2, z: 2.36, rz: 0.62 });
    box(barn, "#ffffff", 0.14, 2.4, 0.14, { y: 1.2, z: 2.36, rz: -0.62 });
    const mill = group(s, { x: 14, z: -15 });
    cyl(mill, "#f2e6d4", 1.4, 7, { y: 3.5, rTop: 0.9, seg: 12 });
    cone(mill, "#8a3a2a", 1.3, 1.6, { y: 7.8 });
    this.mill = group(mill, { y: 6.6, z: 1.3 });
    for (let k = 0; k < 4; k++) {
      const arm = group(this.mill, { rz: (k * Math.PI) / 2 });
      box(arm, "#7a5a3a", 0.16, 3.6, 0.1, { y: 1.8 });
      box(arm, "#fff8ec", 0.9, 2.6, 0.05, { x: 0.5, y: 2.1 });
    }
    ball(this.mill, "#5a3a2a", 0.3);
    // trees and bushes
    for (const [x, z, k] of [
      [-18, -9, 1.8],
      [-21, -3, 1.5],
      [19, -9, 1.7],
      [21, -2, 1.4],
      [-9, -18, 1.6],
      [7, -20, 1.9],
      [-16, 6, 1.3],
      [17, 6, 1.4],
    ])
      tree(s, x, z, k, x < 0 ? "#4fb04a" : "#5cc44f");
    for (const [x, z] of [
      [-24, -14],
      [24, -13],
      [-4, -22],
      [27, -20],
    ])
      pine(s, x, z, 2.2);
    // flowers (instanced)
    const fl = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 6, 4), flat("#ffffff"), 90);
    const m4 = new THREE.Matrix4();
    const cols = ["#ffffff", "#ffe14a", "#ff7ad9", "#ff5a5a", "#b9a6ff"];
    for (let i = 0; i < 90; i++) {
      let x = (this.rnd() - 0.5) * 44,
        z = -12 + this.rnd() * 22;
      if (Math.abs(z + 1.1) < 3.6 && Math.abs(x) < 20) z += z > -1.1 ? 4 : -4;
      m4.makeTranslation(x, 0.12, z);
      fl.setMatrixAt(i, m4);
      fl.setColorAt(i, new THREE.Color(cols[i % cols.length]));
    }
    s.add(fl);
    for (const [x, y, z, k] of [
      [-18, 13, -30, 1.6],
      [6, 15, -38, 2],
      [22, 12, -28, 1.4],
      [-4, 11, -24, 1.1],
    ])
      cloud(s, x, y, z, k);
  }

  // ------------------------------------------------------------ rounds

  private planRound(r: number) {
    const R = ROUNDS[r];
    const ri = (a: number, b: number) => a + Math.floor(this.rnd() * (b - a + 1));
    const nS = ri(R.sheep[0], R.sheep[1]);
    const nD = ri(R.decoys[0], R.decoys[1]);
    const kinds: Kind[] = [...Array(nS).fill("sheep"), ...Array.from({ length: nD }, () => (this.rnd() < 0.5 ? "pig" : "goat"))];
    // shuffle, but never start with a decoy
    for (let i = kinds.length - 1; i > 0; i--) {
      const j = Math.floor(this.rnd() * (i + 1));
      [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
    }
    const firstSheep = kinds.indexOf("sheep");
    [kinds[0], kinds[firstSheep]] = [kinds[firstSheep], kinds[0]];
    this.count = nS;
    for (const a of this.animals) a.g?.removeFromParent();
    this.animals = [];
    let t = 0.4;
    let k = 0;
    const lanes = [-3.4, -2.3, -1.2, -0.1, 1.0];
    while (k < kinds.length) {
      const b = Math.min(kinds.length - k, ri(R.burst[0], R.burst[1]));
      const used = new Set<number>();
      for (let j = 0; j < b; j++) {
        let lane = Math.floor(this.rnd() * lanes.length);
        while (used.has(lane) && used.size < lanes.length) lane = (lane + 1) % lanes.length;
        used.add(lane);
        const v = R.speed * (0.85 + this.rnd() * 0.3) * (kinds[k] === "pig" ? 0.9 : 1);
        this.animals.push({ kind: kinds[k], g: null as unknown as THREE.Group, legs: [], head: null as unknown as THREE.Object3D, x: X0, z: lanes[lane] + (this.rnd() - 0.5) * 0.3, v, at: t + j * (0.12 + this.rnd() * 0.25), ph: this.rnd() * 6, jumped: false, landed: false, alive: true, spawned: false });
        k++;
      }
      t += R.gap[0] + this.rnd() * (R.gap[1] - R.gap[0]) + b * 0.18;
    }
  }

  private startRound() {
    this.round++;
    this.planRound(this.round);
    this.phase = "intro";
    this.pt = 0;
    const subs = [T("Count the sheep!", "好好数羊！"), T("Pigs and goats don't count!", "猪和山羊不算！"), T("Super fast now, focus!", "超快的，集中注意力！")];
    this.hud.banner(T(`ROUND ${this.round + 1} / 3`, `第 ${this.round + 1} / 3 回合`), { color: "#ffffff", sub: subs[this.round] });
    this.sound("bell");
    this.players.forEach((_, i) => {
      this.held[i] = null;
      this.picks[i] = null;
      if (this.labels[i]) this.hud.removeLabel(this.labels[i]!);
      this.labels[i] = null;
    });
    if (this.round === 2) music.speed(1.12);
  }

  start() {
    this.startRound();
  }

  protected idle(dt: number) {
    this.moveCam([0, 8.8, 14.5], [0, 0.4, -1.4], dt, 1.4);
    this.mill.rotation.z += dt * 0.8;
  }

  protected cpu(i: number): CpuPad {
    if (this.phase !== "pick" || this.pt < this.cpuAt[i]) return {};
    const [x, y] = DIRS[this.cpuSlot[i]];
    return { x, y };
  }

  private dirSlot(x: number, y: number): number | null {
    if (Math.hypot(x, y) < 0.5) return null;
    // angle clockwise from up
    const a = Math.atan2(x, -y);
    return (Math.round(a / (Math.PI / 4)) + 8) % 8;
  }

  protected step(dt: number) {
    this.pt += dt;
    this.mill.rotation.z += dt * 0.8;
    const face = this.phase === "pick" || this.phase === "reveal";
    const look = face ? [0, 3.3, 0] : [0, 0.4, -1.4];
    const pos = face ? [0, 5.4, 15.8] : [0, 8.8, 14.5];
    this.moveCam(pos as [number, number, number], look as [number, number, number], dt, 2);
    this.updateAnimals(dt);
    switch (this.phase) {
      case "intro":
        this.players.forEach((_, i) => this.avatars[i].face(Math.PI, dt, 6));
        if (this.pt > 1.6) {
          this.phase = "run";
          this.pt = 0;
          this.sound("whistle");
        }
        break;
      case "run": {
        // players follow the herd with their heads
        let fx = 0,
          n = 0;
        for (const a of this.animals) if (a.spawned && a.alive && Math.abs(a.x) < 10) (fx += a.x), n++;
        const tx = n ? fx / n : 0;
        this.players.forEach((_, i) => this.avatars[i].faceTo(tx * 0.6, -1, dt, 3));
        const last = this.animals[this.animals.length - 1];
        if (this.animals.every((a) => a.jumped) && this.pt > last.at + 0.6 && this.animals.every((a) => !a.alive || a.x > JUMP + 1.5)) this.beginPick();
        break;
      }
      case "pick": {
        const left = PICK - this.pt;
        this.hud.timer(left);
        const sec = Math.ceil(left);
        if (sec !== this.lastTick && sec <= 3 && sec > 0) {
          this.lastTick = sec;
          this.sound("tick");
        }
        this.players.forEach((p, i) => {
          this.avatars[i].face(0, dt, 6);
          const pad = this.pad(i);
          const s = this.dirSlot(pad.x, pad.y);
          if (s !== null && s !== this.held[i]) {
            if (this.held[i] === null) this.sound("select");
            this.held[i] = s;
            this.buzz(i, 12);
          }
          const el = this.labels[i];
          if (el) {
            const ok = this.held[i] !== null;
            el.classList.toggle("ok", ok);
            const h = ok ? "✓" : "?";
            if (el.innerHTML !== h) el.innerHTML = h;
          }
          void p;
        });
        if (left <= 0) this.beginReveal();
        break;
      }
      case "reveal": {
        const t = this.pt;
        // count up the sheep
        const k = clamp(Math.floor((t - 0.9) / Math.max(0.05, 1.6 / this.count)), -1, this.count);
        if (k !== this.shownCount && k >= 0) {
          this.shownCount = k;
          if (!this.counter) this.counter = this.hud.add("", "cm-count");
          this.counter.innerHTML = `<div class="v">${k}</div><div class="l">${T("sheep", "只羊")}</div>`;
          if (k < this.count) sfx.note(k % 12, 0.06, "square", 0.06);
          else this.scoreRound();
        }
        if (t > 5.6) {
          this.counter?.remove();
          this.counter = null;
          if (this.round >= ROUNDS.length - 1) {
            this.phase = "done";
            this.finishByScore(this.scores);
          } else this.startRound();
        }
        break;
      }
    }
  }

  private updateAnimals(dt: number) {
    const tNow = this.phase === "run" ? this.pt : 1e9;
    for (const a of this.animals) {
      if (!a.alive) continue;
      if (!a.spawned) {
        if (tNow < a.at) continue;
        this.spawnAnimal(a);
      }
      a.x += a.v * dt;
      a.ph += dt * a.v * 2.6;
      const u = (a.x + JUMP) / (2 * JUMP);
      const H = a.kind === "goat" ? 2.0 : a.kind === "pig" ? 1.45 : 1.65;
      let y = 0;
      if (u > 0 && u < 1) {
        y = Math.sin(Math.PI * u) * H;
        if (!a.jumped) {
          a.jumped = true;
          if (a.kind === "sheep") {
            sfx.note(7 + Math.floor(Math.random() * 3), 0.09, "sawtooth", 0.035);
            if (Date.now() - this.lastJump > 60) this.sound("jump");
          } else if (a.kind === "pig") sfx.note(-14, 0.12, "square", 0.06);
          else sfx.note(-2, 0.1, "triangle", 0.08);
          this.lastJump = Date.now();
        }
      } else if (u >= 1 && !a.landed) {
        a.landed = true;
        this.fx.dust({ x: a.x, y: 0, z: a.z }, 5);
      } else y = Math.abs(Math.sin(a.ph)) * 0.12;
      a.g.position.set(a.x, y, a.z);
      a.g.rotation.z = u > 0 && u < 1 ? Math.cos(Math.PI * u) * 0.35 : 0;
      const air = u > 0 && u < 1;
      a.legs.forEach((l, k) => (l.rotation.z = air ? (k < 2 ? 0.8 : -0.8) : Math.sin(a.ph + (k % 2 ? Math.PI : 0) + (k < 2 ? 0 : Math.PI / 2)) * 0.6));
      a.head.rotation.z = Math.sin(a.ph * 0.5) * 0.08;
      if (a.x > X1) {
        a.alive = false;
        a.g.removeFromParent();
      }
    }
  }

  private beginPick() {
    this.phase = "pick";
    this.pt = 0;
    this.lastTick = -1;
    this.sound("ding");
    // the right answer is never at either end of the dial (no free clue)
    const off = 1 + Math.floor(this.rnd() * 6);
    this.lo = Math.max(1, this.count - off);
    const nums = DIRS.map((_, k) => this.lo + k);
    const items = nums
      .map((n, k) => {
        const [dx, dy] = DIRS[k];
        return `<div class="n" style="left:${50 + dx * 40}%;top:${50 + dy * 40}%">${n}</div>`;
      })
      .join("");
    this.dial = this.hud.add(`<div class="ring"></div>${items}<div class="mid">${T("How many<b>sheep?</b>", "有几只<b>羊？</b>")}</div>`, "cm-dial");
    this.hud.tip(T("Hold the stick on your answer · it's secret!", "把摇杆推向你的答案 · 秘密作答！"));
    this.players.forEach((p, i) => {
      this.held[i] = null;
      const el = this.hud.label(this.avatars[i].root, "?", { dy: 1.75, cls: "cm-q", color: "rgba(20,14,40,.85)" });
      el.style.setProperty("--pc", p.char.color);
      this.labels[i] = el;
      if (p.cpu) {
        const sd = 0.5 + (1 - p.level) * 2.2 + this.round * 0.5;
        const g = (Math.random() + Math.random() + Math.random() - 1.5) * 2 * sd;
        const guess = clamp(Math.round(this.count + g), this.lo, this.lo + 7);
        this.cpuSlot[i] = guess - this.lo;
        this.cpuAt[i] = 0.6 + Math.random() * 3;
      }
    });
  }

  private beginReveal() {
    this.phase = "reveal";
    this.pt = 0;
    this.shownCount = -1;
    this.hud.timer(null);
    this.hud.tip(null);
    this.dial?.classList.add("out");
    const d = this.dial;
    this.dial = null;
    setTimeout(() => d?.remove(), 400);
    this.sound("confirm");
    this.players.forEach((_, i) => {
      this.picks[i] = this.held[i] === null ? null : this.lo + this.held[i]!;
      const el = this.labels[i];
      if (el) {
        el.classList.remove("ok");
        el.classList.add("ans");
        el.innerHTML = this.picks[i] === null ? "—" : String(this.picks[i]);
      }
    });
  }

  private scoreRound() {
    const N = this.count;
    const errs = this.picks.map((p) => (p === null ? Infinity : Math.abs(p - N)));
    const best = Math.min(...errs);
    this.sound("fanfare");
    this.fx.confetti({ x: 0, y: 4, z: -1 }, 40);
    this.players.forEach((p, i) => {
      const el = this.labels[i];
      const a = this.avatars[i];
      let pts = 0;
      if (errs[i] === 0) pts = 2;
      else if (best > 0 && errs[i] === best && best < Infinity) pts = 1;
      el?.classList.add(pts === 2 ? "exact" : pts === 1 ? "close" : "far");
      if (pts) {
        this.scores[i] += pts;
        this.hud.setScore(p.i, `${STAR} ${this.scores[i]}`);
        this.hud.pop(a.pos.clone().setY(3.6), `+${pts}`, pts === 2 ? "#7dff8a" : "#ffe14a", this.camera);
        this.fx.sparkle({ x: a.pos.x, y: 2.4, z: a.pos.z }, pts === 2 ? "#7dff8a" : "#ffe14a", 16);
        a.anim = "win";
        this.buzz(i, [40, 30, 40]);
      } else a.anim = "lose";
    });
    // back to sitting a bit later
    const r = this.round;
    setTimeout(() => {
      if (this.round === r && !this.finished)
        this.players.forEach((_, i) => {
          const a = this.avatars[i];
          if (a) a.anim = "sit";
        });
    }, 1800);
  }

  protected celebrate(res: { place: number[] }) {
    this.avatars.forEach((a, i) => {
      a.yaw = 0;
      a.anim = res.place[i] === 1 ? "win" : "lose";
    });
  }

  protected outroStep(dt: number) {
    this.mill.rotation.z += dt * 0.8;
    this.updateAnimals(dt);
  }
}

void lerp;
void easeOutBack;

const def: MiniDef = {
  id: "compte-moutons",
  name: "Sheep Count",
  icon: "🐑",
  color: "#a6e3ff",
  tagline: "How many sheep jumped? The closest wins.",
  rules: "Count the sheep jumping the fence (not the pigs or goats!). Then hold the stick on your number on the dial, in secret. Exact = 2 points, else the closest = 1 point.",
  controls: { stick: "Pick a number (hold it)" },
  modes: ["ffa"],
  length: 55,
  music: "amsterdam",
  create: (ctx) => new CompteMoutons(ctx),
};
export default def;
