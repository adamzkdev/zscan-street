/**
 * CORDE À SAUTER (chacun pour soi, 60 s max): in a schoolyard, two chunky robots turn a long
 * candy-striped rope; the four players stand in a row and press A to jump it. The rope speeds up,
 * the robots sometimes play a trick (a sly slow turn), and from 28 s a second rope joins in,
 * double-dutch style. Caught by a rope = tripped and out. Last one jumping wins; at 60 s the
 * survivors share the win.
 */
import * as THREE from "three";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef } from "../types";
import { GEO, ball, box, canvasTex, cyl, flat, group, textSprite, toon, tree } from "../../engine/gfx";
import { clamp, damp } from "../../engine/util";
import { music } from "../../engine/audio";
import { T } from "../../../../i18n/lang";

const TIME = 60;
const XS = [-3.3, -1.1, 1.1, 3.3];
const HAND_X = 7.6;
const HAND_Y = 1.85;
const R0 = 0.35; // crank radius
const AMP = 2.05; // rope swing at the middle
const SEG = 40;
const JUMP_V = 8.2;
const GRAV = 30;
const BENCH_Z = -4.8;
const DOUBLE_AT = 28;
const TAU = Math.PI * 2;

/** A jump count as the cards show it. */
const jumpsTxt = (n: number) => T(`${n} jump${n === 1 ? "" : "s"}`, `${n} 跳`);

interface Rope {
  mesh: THREE.InstancedMesh;
  /** Offset of its angle from the main angle (π for the second rope). */
  off: number;
  /** Turning direction (z sign). */
  dir: number;
  zOff: number;
  on: number;
}

interface Jumper {
  x: number;
  y: number;
  vy: number;
  air: boolean;
  out: boolean;
  outT: number;
  jumps: number;
  /** Trip animation: 0 none, then seconds since the trip. */
  trip: number;
  tripDir: number;
  z: number;
  seated: boolean;
}

interface Brain {
  /** The crossing this CPU has planned a jump for. */
  plan: number;
  at: number;
  fooled: boolean;
  believed: number;
}

interface Robot {
  root: THREE.Group;
  body: THREE.Group;
  wheel: THREE.Group;
  wheel2: THREE.Group;
  arm2: THREE.Group;
  eyes: THREE.Mesh[];
  bulb: THREE.Mesh;
  side: number;
}

class CordeASauter extends BaseMini {
  private theta = Math.PI * 0.85;
  private omega = 0;
  private baseOmega = TAU / 1.45;
  private ropes: Rope[] = [];
  private jumpers: Jumper[] = [];
  private brains: Brain[] = [];
  private robots: Robot[] = [];
  private crossings = 0;
  /** Fake-out: a slow turn. 0 = none; else the crossing count it ends at. */
  private fakeUntil = -1;
  private nextFake = 12;
  private fakeK = 1;
  private omegaBefore = 0;
  private double = false;
  private hurried = false;
  private faster = false;
  private outCount = 0;
  private endT = -1;
  private eyeMat = toon("#5ff3ff", "#2fd8ff", 0.9);
  private slyMat = toon("#ff7ad9", "#ff3fb0", 0.9);
  private bulbOn = toon("#ffe14a", "#ffb000", 1);
  private bulbSly = toon("#ff5ad0", "#ff2fa0", 1);
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private up = new THREE.Vector3(0, 1, 0);
  private pts: THREE.Vector3[] = Array.from({ length: SEG + 1 }, () => new THREE.Vector3());
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private dustT = 0;

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#58b4ff", "#e4f6ff"], size: 14, sun: [0.35, 1, 0.6], fog: { near: 40, far: 100 } });
    this.buildYard();
    this.robots.push(this.buildRobot(-1, "#ff8a2e", "#ffd23f"), this.buildRobot(1, "#2fbfae", "#b8f0e6"));
    this.ropes.push(this.makeRope(0, 1, -0.22, "#ff3d7a"), this.makeRope(Math.PI, -1, 0.22, "#2f8dff"));
    this.ropes[1].on = 0;
    this.ropes[1].mesh.visible = false;
    this.players.forEach((p, i) => {
      const x = XS[i] ?? (i - 1.5) * 2.2;
      const a = this.spawn(i, x, 0, 0);
      a.setRing(p.char.color);
      this.jumpers.push({ x, y: 0, vy: 0, air: false, out: false, outT: 0, jumps: 0, trip: 0, tripDir: 1, z: 0, seated: false });
      this.brains.push({ plan: -1, at: 0.27, fooled: false, believed: this.baseOmega });
    });
    this.hud.players(this.players, () => jumpsTxt(0));
    this.hud.timer(TIME);
    this.updateRopes();
    this.setCam([0, 9, 26], [0, 2, 0], 40);
  }

  // ------------------------------------------------------------ the schoolyard

  private buildYard() {
    const s = this.scene;
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(160, 120), toon("#8fd16a"));
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.02;
    grass.receiveShadow = true;
    s.add(grass);
    // the playground court, with painted games
    const tex = canvasTex(1024, 512, (g, w, h) => {
      g.fillStyle = "#c7c3d6";
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) {
        g.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)";
        g.fillRect(Math.random() * w, Math.random() * h, 3, 3);
      }
      g.strokeStyle = "#ffffff";
      g.lineWidth = 8;
      g.strokeRect(20, 20, w - 40, h - 40);
      // the jumping lane
      g.strokeStyle = "#ffd23f";
      g.setLineDash([30, 20]);
      g.beginPath();
      g.moveTo(80, h * 0.5);
      g.lineTo(w - 80, h * 0.5);
      g.stroke();
      g.setLineDash([]);
      // hopscotch
      g.strokeStyle = "#ff7ad9";
      g.lineWidth = 7;
      const hx = 60,
        hy = 40;
      for (let k = 0; k < 6; k++) g.strokeRect(hx + k * 52, hy + (k % 2) * 4, 50, 50);
      g.fillStyle = "#ff7ad9";
      g.font = "bold 34px sans-serif";
      for (let k = 0; k < 6; k++) g.fillText(String(k + 1), hx + k * 52 + 16, hy + 37);
      // a target circle
      g.strokeStyle = "#3fcf5a";
      g.beginPath();
      g.arc(w - 140, h - 110, 70, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.arc(w - 140, h - 110, 36, 0, Math.PI * 2);
      g.stroke();
    });
    const court = new THREE.Mesh(new THREE.PlaneGeometry(30, 15), new THREE.MeshToonMaterial({ map: tex }));
    court.rotation.x = -Math.PI / 2;
    court.position.set(0, 0, -1);
    court.receiveShadow = true;
    s.add(court);
    // the school
    const sch = group(s, { z: -17 });
    box(sch, "#e9875e", 44, 9, 4, { y: 4.5 });
    box(sch, "#fff1dc", 44.4, 0.5, 4.4, { y: 9.1 });
    box(sch, "#6d5a8a", 44.6, 1.6, 4.6, { y: 10.1 });
    box(sch, "#e9875e", 10, 3.5, 4, { y: 12.3 });
    box(sch, "#6d5a8a", 10.6, 0.8, 4.4, { y: 14.4 });
    cyl(sch, "#ffffff", 1.3, 0.3, { y: 12.4, z: 2.05, rx: Math.PI / 2, seg: 28 });
    cyl(sch, "#1d1630", 1.42, 0.2, { y: 12.4, z: 1.98, rx: Math.PI / 2, seg: 28 });
    box(sch, "#1d1630", 0.12, 0.9, 0.1, { y: 12.75, z: 2.25 });
    box(sch, "#1d1630", 0.7, 0.12, 0.1, { x: 0.3, y: 12.4, z: 2.25 });
    for (let fx = -20; fx <= 20; fx += 3.4) {
      if (Math.abs(fx) < 2) continue;
      for (const fy of [2.6, 6.4]) {
        box(sch, "#fff1dc", 2.2, 2.6, 0.2, { x: fx, y: fy, z: 2.02, cast: false });
        box(sch, "#7fc8ff", 1.8, 2.2, 0.2, { x: fx, y: fy, z: 2.08, cast: false });
        box(sch, "#fff1dc", 0.12, 2.2, 0.1, { x: fx, y: fy, z: 2.2, cast: false });
      }
    }
    box(sch, "#8a4a3a", 3, 4.4, 0.3, { y: 2.2, z: 2.05 });
    const sign = textSprite(T("ZSTREET JUMP SCHOOL", "ZSTREET 跳绳学校"), 0.9, { color: "#1d1630", bg: "#fff6d8" });
    sign.position.set(-6, 8.15, 2.3);
    sch.add(sign);
    // fence and trees
    for (let x = -24; x <= 24; x += 1.6) {
      box(s, "#ffffff", 0.18, 1.3, 0.12, { x, y: 0.65, z: -10.5, cast: false });
    }
    box(s, "#ffffff", 48, 0.14, 0.1, { y: 0.95, z: -10.45, cast: false });
    box(s, "#ffffff", 48, 0.14, 0.1, { y: 0.45, z: -10.45, cast: false });
    for (const [x, z, k] of [
      [-15, -8, 1.8],
      [-19, -4, 1.5],
      [16, -8, 1.9],
      [20, -3, 1.4],
      [-23, -12, 2.2],
      [24, -12, 2.1],
      [-12, -13, 1.7],
      [12, -13.5, 1.6],
    ])
      tree(s, x, z, k, (x * z) % 2 ? "#5cc44f" : "#48b04a");
    // bunting between two poles
    const poleL = new THREE.Vector3(-13, 5.2, -7),
      poleR = new THREE.Vector3(13, 5.2, -7);
    for (const p of [poleL, poleR]) cyl(s, "#ffffff", 0.1, 5.4, { x: p.x, y: 2.7, z: p.z, seg: 8 });
    const tri = new THREE.Shape();
    tri.moveTo(-0.32, 0);
    tri.lineTo(0.32, 0);
    tri.lineTo(0, -0.6);
    tri.closePath();
    const triGeo = new THREE.ShapeGeometry(tri);
    const fcols = ["#ff4b3e", "#ffd23f", "#3fcf5a", "#2f8dff", "#ff7ad9", "#9b5cff"];
    for (let k = 0; k <= 26; k++) {
      const t = k / 26;
      const p = poleL.clone().lerp(poleR, t);
      p.y -= Math.sin(t * Math.PI) * 1.4;
      const m = new THREE.Mesh(triGeo, flat(fcols[k % fcols.length]));
      m.position.copy(p);
      (m.material as THREE.Material).side = THREE.DoubleSide;
      s.add(m);
    }
    // the bench for those who trip
    const bench = group(s, { z: BENCH_Z });
    box(bench, "#c9854a", 9.6, 0.18, 0.9, { y: 0.48 });
    box(bench, "#c9854a", 9.6, 0.7, 0.14, { y: 1.0, z: -0.45 });
    for (const x of [-4.4, 0, 4.4]) box(bench, "#5a4a6a", 0.16, 0.48, 0.8, { x, y: 0.24 });
    // a few toys around
    ball(s, "#ff4b3e", 0.4, { x: -11, y: 0.4, z: 3 });
    ball(s, "#2f8dff", 0.32, { x: 12.5, y: 0.32, z: 2.6 });
    const cone2 = group(s, { x: 10.5, z: -5.5 });
    cyl(cone2, "#ff8a2e", 0.35, 0.9, { y: 0.45, rTop: 0.06, seg: 12 });
  }

  private buildRobot(side: number, main: string, light: string): Robot {
    const s = this.scene;
    const root = group(s, { x: side * (HAND_X + 1.75), z: 0 });
    root.rotation.y = -side * Math.PI / 2 + side * 0.35;
    const body = group(root);
    // tracks / feet
    for (const fx of [-0.45, 0.45]) {
      box(body, "#3a3450", 0.5, 0.45, 1.1, { x: fx, y: 0.22 });
      cyl(body, "#5a5470", 0.18, 0.6, { x: fx, y: 0.6 });
    }
    box(body, main, 1.7, 1.5, 1.2, { y: 1.55 });
    box(body, light, 1.0, 0.7, 0.1, { y: 1.6, z: 0.62 });
    for (let k = 0; k < 3; k++) ball(body, flat(["#ff4b3e", "#ffd23f", "#3fcf5a"][k]), 0.08, { x: -0.25 + k * 0.25, y: 1.65, z: 0.68, cast: false });
    box(body, "#5a5470", 0.35, 0.25, 0.35, { y: 2.42 });
    const head = group(body, { y: 2.95 });
    box(head, main, 1.25, 0.95, 1.0);
    box(head, "#1d1630", 1.0, 0.62, 0.1, { z: 0.5 });
    const eyes = [-0.24, 0.24].map((ex) => ball(head, this.eyeMat, [0.13, 0.15, 0.06], { x: ex, y: 0.03, z: 0.56, cast: false }));
    cyl(head, "#5a5470", 0.04, 0.5, { y: 0.72 });
    const bulb = ball(head, this.bulbOn, 0.13, { y: 1.02, cast: false });
    for (const ex of [-0.68, 0.68]) cyl(head, "#5a5470", 0.16, 0.12, { x: ex, rz: Math.PI / 2 });
    // the crank arm toward the rope (the root faces the rope side)
    // world crank centre: (side*HAND_X, HAND_Y, z) – build the wheels at the root level, then place in world each frame
    const wheel = group(s, { x: side * HAND_X, y: HAND_Y, z: -0.22 });
    cyl(wheel, light, R0 + 0.12, 0.12, { rx: 0, rz: Math.PI / 2, seg: 16 });
    cyl(wheel, "#3a3450", 0.07, 0.3, { rz: Math.PI / 2, seg: 8 });
    const wheel2 = group(s, { x: side * HAND_X, y: HAND_Y, z: 0.22 });
    cyl(wheel2, main, R0 + 0.12, 0.12, { rz: Math.PI / 2, seg: 16 });
    wheel2.visible = false;
    // a stubby arm from the body to each wheel (drawn in world space)
    const shoulder = new THREE.Vector3(side * (HAND_X + 1.0), 1.95, -0.22);
    const armMesh = cyl(s, main, 0.16, 1, { seg: 10 });
    const d = new THREE.Vector3(side * HAND_X, HAND_Y, -0.22).sub(shoulder);
    armMesh.scale.set(0.16, d.length(), 0.16);
    armMesh.position.copy(shoulder).addScaledVector(d, 0.5);
    armMesh.quaternion.setFromUnitVectors(this.up, d.clone().normalize());
    const arm2 = group(s);
    const a2 = cyl(arm2, main, 0.16, 1, { seg: 10 });
    const sh2 = new THREE.Vector3(side * (HAND_X + 1.0), 1.95, 0.22);
    const d2 = new THREE.Vector3(side * HAND_X, HAND_Y, 0.22).sub(sh2);
    a2.scale.set(0.16, d2.length(), 0.16);
    a2.position.copy(sh2).addScaledVector(d2, 0.5);
    a2.quaternion.setFromUnitVectors(this.up, d2.clone().normalize());
    arm2.visible = false;
    return { root, body, wheel, wheel2, arm2, eyes, bulb, side };
  }

  private makeRope(off: number, dir: number, zOff: number, color: string): Rope {
    const mesh = new THREE.InstancedMesh(GEO.cylLo, toon("#ffffff"), SEG);
    const a = new THREE.Color(color),
      b = new THREE.Color("#ffffff");
    for (let k = 0; k < SEG; k++) mesh.setColorAt(k, Math.floor(k / 2) % 2 ? b : a);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    return { mesh, off, dir, zOff, on: 1 };
  }

  // ------------------------------------------------------------ rope maths

  private ampAt(x: number) {
    const s = (x + HAND_X) / (2 * HAND_X);
    return R0 + (AMP - R0) * Math.sin(Math.PI * clamp(s, 0, 1));
  }
  /** Height of rope k's lowest point at x, when it sweeps under the players. */
  private ropeLowY(x: number) {
    return Math.max(0.06, HAND_Y - this.ampAt(x));
  }

  private updateRopes() {
    for (const r of this.ropes) {
      if (!r.mesh.visible) continue;
      const th = this.theta + r.off;
      const c = Math.cos(th),
        sn = Math.sin(th) * r.dir;
      for (let k = 0; k <= SEG; k++) {
        const x = -HAND_X + (2 * HAND_X * k) / SEG;
        const A = this.ampAt(x) * (0.25 + 0.75 * r.on);
        this.pts[k].set(x, Math.max(0.06, HAND_Y - A * c), r.zOff + A * sn);
      }
      for (let k = 0; k < SEG; k++) {
        const p0 = this.pts[k],
          p1 = this.pts[k + 1];
        this.tmp.subVectors(p1, p0);
        const len = this.tmp.length();
        this.tmp.divideScalar(len || 1);
        this.q.setFromUnitVectors(this.up, this.tmp);
        this.tmp2.addVectors(p0, p1).multiplyScalar(0.5);
        this.m4.compose(this.tmp2, this.q, new THREE.Vector3(0.075, len * 1.15, 0.075));
        r.mesh.setMatrixAt(k, this.m4);
      }
      r.mesh.instanceMatrix.needsUpdate = true;
    }
    for (const rb of this.robots) {
      rb.wheel.rotation.x = -this.theta;
      rb.wheel2.rotation.x = this.theta + Math.PI;
      rb.body.position.y = Math.abs(Math.sin(this.theta)) * 0.06;
      rb.body.rotation.z = Math.sin(this.theta) * 0.04;
    }
  }

  // ------------------------------------------------------------ CPUs

  /** Seconds until the next rope sweeps under the players (as a CPU believes). */
  private etaNext(omega: number) {
    let best = Infinity;
    for (const r of this.ropes) {
      if (r.on < 0.99) continue;
      const th = this.theta + r.off;
      const rem = TAU - (((th % TAU) + TAU) % TAU);
      best = Math.min(best, rem / Math.max(0.3, omega));
    }
    return best;
  }

  protected cpu(i: number, dt: number): CpuPad {
    const me = this.jumpers[i];
    if (me.out) return {};
    const lv = this.players[i].level;
    const b = this.brains[i];
    b.believed = damp(b.believed, this.omega, 2 + 9 * lv, dt);
    const om = b.fooled ? this.omegaBefore : b.believed;
    const eta = this.etaNext(om);
    // the id of the next crossing (each rope crossing counts)
    const next = this.crossings + 1;
    if (b.plan !== next) {
      b.plan = next;
      const sigma = 0.03 + (1 - lv) * 0.1;
      // a gaussian-ish spread around the ideal moment (the jump's top)
      const g = (Math.random() + Math.random() + Math.random() - 1.5) * 2;
      b.at = clamp(0.26 + g * sigma, 0.02, 0.6);
      b.fooled = this.fakeUntil > this.crossings && Math.random() < (1 - lv) * 0.45;
    }
    if (!me.air && eta <= b.at && eta < 0.7) return { a: true };
    return {};
  }

  // ------------------------------------------------------------ the game

  protected idle(dt: number) {
    this.omega = damp(this.omega, 1.2, 2, dt);
    this.theta += this.omega * dt * 0.5;
    this.updateRopes();
    this.moveCam([0, 5.2, 17.5], [0, 1.6, 0], dt, 1.6);
  }

  start() {
    this.omega = this.baseOmega * 0.8;
  }

  protected step(dt: number) {
    const left = TIME - this.t;
    this.hud.timer(left);
    this.moveCam([0, 5.2, 17.5], [0, 1.6, 0], dt, 3);

    // ---- the rope's speed: faster and faster, a slow trick now and then, then two ropes
    let period: number;
    if (this.t < DOUBLE_AT - 2) period = 1.45 - (0.62 * this.t) / (DOUBLE_AT - 2);
    else if (this.t < DOUBLE_AT) period = 1.9;
    else period = 1.8 - (0.5 * (this.t - DOUBLE_AT)) / (TIME - DOUBLE_AT);
    this.baseOmega = TAU / period;
    if (!this.faster && this.t > 12) {
      this.faster = true;
      this.hud.banner(T("SPEEDING UP!", "加速了！"), { color: "#ffd23f", ms: 1000 });
      this.sound("power");
    }
    if (!this.double && this.t >= DOUBLE_AT) {
      this.double = true;
      this.ropes[1].mesh.visible = true;
      for (const rb of this.robots) {
        rb.wheel2.visible = true;
        rb.arm2.visible = true;
      }
      this.hud.banner(T("DOUBLE ROPE!", "双绳来了！"), { color: "#5ff3ff", ms: 1400, sub: T("Two ropes, twice the jumps", "两根绳，跳两倍") });
      this.sound("bell");
      this.nextFake = this.t + 6;
    }
    if (this.double) {
      // the second rope swings in gently, and only counts once fully out
      const r = this.ropes[1];
      if (r.on < 1) {
        const th2 = this.theta + r.off;
        const atTop = Math.cos(th2) < -0.2;
        r.on = Math.min(1, r.on + dt * (atTop ? 0.8 : 0.3));
      }
    }
    if (!this.hurried && left <= 10) {
      this.hurried = true;
      this.hud.banner(T("10 SECONDS LEFT!", "还剩 10 秒！"), { color: "#ff7a3d", ms: 1100 });
      music.speed(1.15);
    }
    // the trick: right after a crossing, the next turn goes slow
    let fakeK = 1;
    if (this.fakeUntil > this.crossings) {
      const eta = this.etaNext(this.omega);
      fakeK = eta > 0.18 ? 0.42 : 0.8;
    }
    this.fakeK = damp(this.fakeK, fakeK, 10, dt);
    const target = this.baseOmega * this.fakeK;
    this.omega = damp(this.omega, target, 4, dt);
    const sly = this.fakeUntil > this.crossings;
    for (const rb of this.robots) {
      for (const e of rb.eyes) {
        e.material = sly ? this.slyMat : this.eyeMat;
        e.scale.y = sly ? 0.05 : 0.15;
      }
      rb.bulb.material = sly && Math.floor(this.t * 8) % 2 ? this.bulbSly : this.bulbOn;
    }

    // ---- turn, and catch whoever is on the ground when a rope sweeps under
    const before = this.theta;
    this.theta += this.omega * dt;
    for (const r of this.ropes) {
      if (r.on < 0.99) continue;
      const a0 = Math.floor((before + r.off) / TAU),
        a1 = Math.floor((this.theta + r.off) / TAU);
      if (a1 > a0) this.crossing(r);
    }
    this.updateRopes();

    // ---- the jumpers
    this.jumpers.forEach((j, i) => {
      const a = this.avatars[i];
      if (j.out) {
        this.stepOut(j, i, dt);
        return;
      }
      const p = this.pad(i);
      if (p.aDown && !j.air) {
        j.air = true;
        j.vy = JUMP_V;
        this.sound("jump");
      }
      if (j.air) {
        j.y += (j.vy - GRAV * dt * 0.5) * dt;
        j.vy -= GRAV * dt;
        if (j.y <= 0) {
          j.y = 0;
          j.vy = 0;
          j.air = false;
          this.fx.dust({ x: j.x, y: 0, z: 0 }, 4);
        }
      }
      a.pos.set(j.x, j.y, 0);
      a.anim = j.air ? "jump" : "idle";
      a.face(0, dt, 6);
      // a little squash on landing / crouch before the rope
      const sq = j.air ? 1 + clamp(j.vy * 0.015, -0.06, 0.08) : 1;
      a.model.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    });

    // dust where the rope slaps the ground
    this.dustT -= dt;

    // ---- the end
    const alive = this.jumpers.filter((j) => !j.out).length;
    if ((alive <= 1 || left <= 0) && this.endT < 0) this.endT = this.t;
    if (this.endT >= 0 && (this.t - this.endT > 0.9 || left <= 0)) this.endGame();
  }

  private crossing(r: Rope) {
    this.crossings++;
    this.sound("click");
    this.sound("thud");
    if (this.dustT <= 0) {
      this.dustT = 0.2;
      this.fx.dust({ x: 0, y: 0, z: r.zOff }, 8, "#ffffff");
    }
    this.jumpers.forEach((j, i) => {
      if (j.out) return;
      const low = this.ropeLowY(j.x);
      if (j.y < low + 0.24) this.trip(i, r.dir);
      else {
        j.jumps++;
        this.hud.setScore(this.players[i].seat, jumpsTxt(j.jumps));
      }
    });
    // schedule the robots' next trick
    if (this.fakeUntil <= this.crossings && this.t >= this.nextFake && this.endT < 0) {
      this.fakeUntil = this.crossings + 1;
      this.omegaBefore = this.omega;
      this.nextFake = this.t + 7 + this.rnd() * 5;
      this.sound("squeak");
    }
  }

  private trip(i: number, dir: number) {
    const j = this.jumpers[i];
    j.out = true;
    j.outT = this.t;
    j.trip = 0.001;
    j.tripDir = dir;
    j.vy = 5;
    j.air = true;
    this.outCount++;
    const a = this.avatars[i];
    a.anim = "fall";
    a.flash();
    a.setRing(null);
    a.model.scale.set(1, 1, 1);
    this.hud.mark(this.players[i].seat, "out");
    this.hud.setScore(this.players[i].seat, T("Caught!", "被绊倒！"));
    this.sound("hit");
    this.sound("boing");
    this.shake = 0.3;
    this.buzz(i, [90, 40, 90]);
    this.fx.burst({ x: j.x, y: 0.4, z: 0 }, { count: 14, colors: ["#ffffff", "#ffe14a", "#ff7ad9"], speed: 5, size: 0.16 });
  }

  /** A tripped player: tumbles, lies a moment, then walks to the bench and sulks. */
  private stepOut(j: Jumper, i: number, dt: number) {
    const a = this.avatars[i];
    j.trip += dt;
    if (j.trip < 1.3) {
      if (j.air) {
        j.y += (j.vy - GRAV * dt * 0.5) * dt;
        j.vy -= GRAV * dt;
        j.z += j.tripDir * 1.6 * dt;
        if (j.y <= 0) {
          j.y = 0;
          j.air = false;
          this.fx.dust({ x: j.x, y: 0, z: j.z }, 8);
          this.sound("thud");
        }
      }
      const lie = clamp(j.trip / 0.4, 0, 1);
      a.model.rotation.x = -j.tripDir * lie * 1.45;
      a.model.position.y = lie * 0.25;
      a.anim = j.air ? "fall" : "stun";
      a.pos.set(j.x, j.y, j.z);
      return;
    }
    a.model.rotation.x = 0;
    a.model.position.y = 0;
    // walk to the bench
    const tz = BENCH_Z + 0.15;
    if (!j.seated) {
      const dz = tz - j.z;
      if (Math.abs(dz) > 0.08) {
        j.z += Math.sign(dz) * Math.min(Math.abs(dz), 3.2 * dt);
        a.anim = "run";
        a.speed = 0.5;
        a.face(Math.sign(dz) > 0 ? 0 : Math.PI, dt);
        a.pos.set(j.x, 0, j.z);
      } else {
        j.seated = true;
      }
    } else {
      a.face(0, dt, 6);
      a.anim = "sit";
      a.pos.set(j.x, 0.48, j.z);
    }
  }

  private endGame() {
    // places: still jumping = 1st; the others by when they tripped (same rope = same place)
    const place = this.jumpers.map((j) => 1 + this.jumpers.filter((o) => (j.out ? !o.out || o.outT > j.outT + 1e-6 : false)).length);
    this.jumpers.forEach((j, i) => {
      if (!j.out) this.hud.mark(this.players[i].seat, "win");
    });
    this.finish(place);
  }

  protected outroStep(dt: number) {
    // the robots slow down and the rope settles at the bottom
    this.omega = damp(this.omega, 0, 1.5, dt);
    const th = this.theta + this.omega * dt;
    this.theta = th;
    this.updateRopes();
    this.jumpers.forEach((j, i) => {
      const a = this.avatars[i];
      if (j.out) {
        this.stepOut(j, i, dt);
        if (j.seated) a.anim = "lose";
        return;
      }
      j.vy -= GRAV * dt;
      j.y = Math.max(0, j.y + j.vy * dt);
      if (j.y === 0) j.vy = 0;
      a.pos.set(j.x, j.y, 0);
      a.model.scale.set(1, 1, 1);
      if (Math.random() < dt * 1.2) this.fx.confetti({ x: j.x, y: 3, z: 0 }, 16);
    });
    for (const rb of this.robots) for (const e of rb.eyes) e.scale.y = 0.15 + Math.max(0, Math.sin(this.t * 3)) * 0.02;
  }
}

const def: MiniDef = {
  id: "corde-a-sauter",
  name: "Jump the Chain",
  icon: "🪢",
  color: "#ff7ad9",
  tagline: "Jump the rope on time. It speeds up…",
  rules: "Jump over the rope on time! It speeds up, the robots sometimes trick you with a slow turn, then a second rope joins. Caught = out.",
  controls: { a: "Jump" },
  modes: ["ffa"],
  length: 60,
  music: "mini",
  create: (ctx) => new CordeASauter(ctx),
};
export default def;
