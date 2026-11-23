/**
 * BARRE TOURNANTE (chacun pour soi, 60 s max): a round carousel stage in a funfair at dusk,
 * surrounded by a pool. A padded bar sweeps the floor (jump it with A); from 15 s a second bar
 * sweeps at head height the other way (hold B to duck). Both speed up and sometimes turn back.
 * Hit = flung into the pool. Players can walk a little on the stage. Last one standing wins.
 */
import * as THREE from "three";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef } from "../types";
import { GEO, ball, box, canvasTex, cone, cyl, flat, group, toon, tree } from "../../engine/gfx";
import { angDiff, clamp, damp } from "../../engine/util";
import { music } from "../../engine/audio";
import { T } from "../../../../i18n/lang";

const TIME = 60;
const R = 7.2;
const HUB = 1.15;
const PR = 0.38;
const SPEED = 3.6;
const JUMP_V = 7.3;
const GRAV = 26;
const LOW_Y = 0.36;
const LOW_R = 0.24;
const HIGH_Y = 1.3;
const HIGH_R = 0.2;
const WATER_Y = -1.4;
const HIGH_AT = 15;
const TAU = Math.PI * 2;
/** Where the high bar is split (the painted inner circle). */
const MID = R * 0.62 - 0.09;
const CAM: [number, number, number] = [0, 12.6, 15.2];
const LOOK: [number, number, number] = [0, -0.6, -0.4];

interface Bar {
  g: THREE.Group;
  ang: number;
  omega: number;
  /** Speed sign we are heading to (flip = -1 · current). */
  dir: number;
  /** Seconds left of the warning before a turn-back. */
  warn: number;
  active: boolean;
  low: boolean;
  y: number;
  /** 2: a full bar through the hub; 1: a single arm. */
  arms: number;
}

interface Dancer {
  x: number;
  z: number;
  y: number;
  vx: number;
  vz: number;
  vy: number;
  air: boolean;
  duck: number;
  out: boolean;
  outT: number;
  flying: boolean;
  swimA: number;
  swimR: number;
  spin: number;
}

interface Brain {
  jumpAt: number;
  lowPlan: number;
  believed: number[];
  home: number;
  homeR: number;
  wander: number;
}

const mod = (a: number, m: number) => ((a % m) + m) % m;

class BarreTournante extends BaseMini {
  private bars: Bar[] = [];
  private ds: Dancer[] = [];
  private brains: Brain[] = [];
  private nextFlip = 10;
  private endT = -1;
  private highShown = false;
  private hurried = false;
  private hubLamp!: THREE.Mesh;
  private lampOn = toon("#ffe14a", "#ffb000", 1);
  private lampWarn = toon("#ff3b3b", "#ff0000", 1);
  private bulbs!: THREE.InstancedMesh;
  private bulbCols: THREE.Color[] = [];
  private waterTex!: THREE.Texture;
  private ducks: THREE.Group[] = [];
  private wheel!: THREE.Group;
  private canopy!: THREE.Group;

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#2b2a78", "#ffab73"], size: 12, sun: [-0.5, 0.8, 0.6], sunColor: "#ffd9b0", sunIntensity: 2.3, hemi: ["#c8b8ff", "#5a3a4a", 1.3], fog: { color: "#e49a8a", near: 40, far: 110 } });
    this.buildFair();
    this.bars.push(this.makeBar(true), this.makeBar(false));
    this.bars[1].active = false;
    this.bars[1].g.visible = false;
    const starts = [Math.PI * 0.75, Math.PI * 0.25, Math.PI * 1.25, Math.PI * 1.75];
    this.players.forEach((p, i) => {
      const a0 = starts[i];
      const r0 = 5.3;
      const x = Math.cos(a0) * r0,
        z = Math.sin(a0) * r0;
      const av = this.spawn(i, x, z, 0);
      av.setRing(p.char.color);
      this.ds.push({ x, z, y: 0, vx: 0, vz: 0, vy: 0, air: false, duck: 0, out: false, outT: 0, flying: false, swimA: 0, swimR: 0, spin: 0 });
      this.brains.push({ jumpAt: 0.2, lowPlan: -1, believed: [0, 0], home: a0, homeR: r0, wander: 0 });
    });
    this.hud.players(this.players, () => T("In play", "在场"));
    this.hud.timer(TIME);
    this.setCam([0, 28, 26], [0, 0, 0], 42);
  }

  // ------------------------------------------------------------ the funfair

  private buildFair() {
    const s = this.scene;
    // the stage: a striped disc on a drum
    const top = canvasTex(1024, 1024, (g, w) => {
      const c = w / 2;
      const n = 16;
      for (let k = 0; k < n; k++) {
        g.beginPath();
        g.moveTo(c, c);
        g.arc(c, c, c, (k / n) * TAU, ((k + 1) / n) * TAU);
        g.closePath();
        g.fillStyle = k % 2 ? "#fff3dc" : "#ff5a6a";
        g.fill();
      }
      g.strokeStyle = "#ffd23f";
      g.lineWidth = 18;
      for (const rr of [0.98, 0.62]) {
        g.beginPath();
        g.arc(c, c, c * rr - 9, 0, TAU);
        g.stroke();
      }
      g.fillStyle = "#6a3ab0";
      g.beginPath();
      g.arc(c, c, c * 0.2, 0, TAU);
      g.fill();
    });
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.5, 64), [toon("#6a3ab0"), new THREE.MeshToonMaterial({ map: top }), toon("#6a3ab0")]);
    disc.position.y = -0.25;
    disc.receiveShadow = true;
    s.add(disc);
    cyl(s, "#4a2a80", R - 0.2, 1.4, { y: -1.2, seg: 48 });
    const trim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.12, 8, 80), toon("#ffd23f", "#7a5200", 0.3));
    trim.rotation.x = Math.PI / 2;
    trim.position.y = 0.0;
    s.add(trim);
    // light bulbs around the rim (they chase)
    const nb = 48;
    this.bulbs = new THREE.InstancedMesh(GEO.sphereLo, new THREE.MeshBasicMaterial({ color: "#ffffff" }), nb);
    const m4 = new THREE.Matrix4();
    for (let k = 0; k < nb; k++) {
      const a = (k / nb) * TAU;
      m4.makeScale(0.13, 0.13, 0.13).setPosition(Math.cos(a) * (R - 0.02), -0.3, Math.sin(a) * (R - 0.02));
      this.bulbs.setMatrixAt(k, m4);
      this.bulbs.setColorAt(k, new THREE.Color("#ffe14a"));
    }
    this.bulbCols = [new THREE.Color("#ffe14a"), new THREE.Color("#ff5ad0"), new THREE.Color("#5ff3ff"), new THREE.Color("#7a6a50")];
    s.add(this.bulbs);
    // the hub: a little carousel tower with a motor
    const hub = group(s);
    cyl(hub, "#ffd23f", HUB, 0.9, { y: 0.45, seg: 28 });
    cyl(hub, "#ff5a6a", HUB * 0.75, 1.6, { y: 1.6, seg: 24 });
    this.hubLamp = ball(hub, this.lampOn, 0.35, { y: 3.05, cast: false });
    this.canopy = group(hub, { y: 2.45 });
    cone(this.canopy, "#ff5a6a", HUB * 1.15, 0.7, { y: 0.0 });
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      ball(this.canopy, flat(k % 2 ? "#ffe14a" : "#ffffff"), 0.1, { x: Math.cos(a) * HUB * 1.1, y: -0.32, z: Math.sin(a) * HUB * 1.1, cast: false });
    }
    // the pool all around
    this.waterTex = canvasTex(
      256,
      256,
      (g, w) => {
        g.fillStyle = "#3bb6e8";
        g.fillRect(0, 0, w, w);
        g.strokeStyle = "rgba(255,255,255,0.4)";
        g.lineWidth = 5;
        g.lineCap = "round";
        for (let i = 0; i < 14; i++) {
          const x = (i * 83) % w,
            y = (i * 47) % w;
          g.beginPath();
          g.arc(x, y, 18, Math.PI * 1.15, Math.PI * 1.85);
          g.stroke();
        }
      },
      true,
    );
    this.waterTex.repeat.set(8, 8);
    const water = new THREE.Mesh(new THREE.RingGeometry(R - 0.3, 19, 64), new THREE.MeshToonMaterial({ map: this.waterTex, color: "#ffffff" }));
    water.rotation.x = -Math.PI / 2;
    water.position.y = WATER_Y;
    water.receiveShadow = true;
    s.add(water);
    // pool edge, then the fairground
    const edge = new THREE.Mesh(new THREE.TorusGeometry(19.2, 0.6, 8, 80), toon("#fff3dc"));
    edge.rotation.x = Math.PI / 2;
    edge.position.y = WATER_Y + 0.3;
    s.add(edge);
    const ground = new THREE.Mesh(new THREE.RingGeometry(19.4, 120, 48), toon("#6a9a5a"));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = WATER_Y + 0.5;
    ground.receiveShadow = true;
    s.add(ground);
    // rubber ducks
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU + 0.4;
      const g = group(s, { x: Math.cos(a) * 12, y: WATER_Y, z: Math.sin(a) * 12 });
      ball(g, "#ffd23f", [0.55, 0.42, 0.7], { y: 0.25 });
      ball(g, "#ffd23f", 0.32, { y: 0.75, z: 0.35 });
      cone(g, "#ff8a2e", 0.12, 0.3, { y: 0.72, z: 0.72, rx: Math.PI / 2, lo: true });
      this.ducks.push(g);
    }
    // a Ferris wheel behind
    this.wheel = group(s, { x: -8, y: 13, z: -34 });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(10, 0.25, 8, 48), toon("#ffffff"));
    this.wheel.add(rim);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU;
      box(this.wheel, "#ffffff", 0.12, 10, 0.12, { x: Math.cos(a) * 5, y: Math.sin(a) * 5, rz: a + Math.PI / 2, cast: false });
      const cab = ball(this.wheel, ["#ff5a6a", "#ffd23f", "#5ff3ff", "#9b5cff"][k % 4], [0.9, 0.8, 0.9], { x: Math.cos(a) * 10, y: Math.sin(a) * 10 - 0.8, lo: true, cast: false });
      void cab;
      ball(this.wheel, flat("#fff3b0"), 0.18, { x: Math.cos(a) * 10, y: Math.sin(a) * 10, z: 0.3, cast: false });
    }
    const legs = group(s, { x: -8, z: -34 });
    for (const sx of [-1, 1]) box(legs, "#d8d0e8", 0.5, 15, 0.5, { x: sx * 4, y: 6.3, rz: sx * 0.28 });
    // striped tents
    const tents: [number, number, string, number][] = [
      [18, -26, "#ff5a6a", 4],
      [28, -14, "#2f8dff", 3.4],
      [-26, -18, "#3fcf5a", 3.6],
      [-30, -4, "#ffd23f", 3],
      [30, 4, "#9b5cff", 3.2],
    ];
    for (const [x, z, c, k] of tents) {
      const g = group(s, { x, y: WATER_Y + 0.5, z });
      cyl(g, "#fff3dc", k, k * 0.9, { y: k * 0.45, seg: 12 });
      for (let q = 0; q < 6; q++) box(g, c, 0.9, k * 0.9, 0.1, { x: Math.cos((q / 6) * TAU) * k, y: k * 0.45, z: Math.sin((q / 6) * TAU) * k, ry: -(q / 6) * TAU + Math.PI / 2, cast: false });
      cone(g, c, k * 1.15, k * 0.9, { y: k * 0.9 + k * 0.45 });
      ball(g, flat("#ffe14a"), 0.25, { y: k * 1.9, cast: false });
    }
    // lamp posts with string lights around the pool
    const posts: THREE.Vector3[] = [];
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * TAU + 0.15;
      const x = Math.cos(a) * 21,
        z = Math.sin(a) * 21;
      cyl(s, "#3a2a50", 0.12, 4.5, { x, y: WATER_Y + 2.75, z, seg: 8 });
      ball(s, flat("#fff3b0"), 0.3, { x, y: WATER_Y + 5.1, z, cast: false });
      posts.push(new THREE.Vector3(x, WATER_Y + 4.9, z));
    }
    const lc = ["#ff5a6a", "#ffe14a", "#5ff3ff", "#ff9a2e", "#ff7ad9"];
    const nl = posts.length * 7;
    const lights = new THREE.InstancedMesh(GEO.sphereLo, new THREE.MeshBasicMaterial({ color: "#ffffff" }), nl);
    let n = 0;
    for (let k = 0; k < posts.length; k++) {
      const a = posts[k],
        b = posts[(k + 1) % posts.length];
      for (let q = 1; q <= 7; q++) {
        const t = q / 8;
        const p = a.clone().lerp(b, t);
        p.y -= Math.sin(t * Math.PI) * 1.1;
        m4.makeScale(0.12, 0.12, 0.12).setPosition(p);
        lights.setMatrixAt(n, m4);
        lights.setColorAt(n, new THREE.Color(lc[n % lc.length]));
        n++;
      }
    }
    s.add(lights);
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * TAU + 0.5;
      tree(s, Math.cos(a) * 27, Math.sin(a) * 27, 1.6 + (k % 3) * 0.3, k % 2 ? "#3f8a5a" : "#4a9a4a", WATER_Y + 0.5);
    }
  }

  private makeBar(low: boolean): Bar {
    const g = group(this.scene);
    const y = low ? LOW_Y : HIGH_Y;
    const r = low ? LOW_R : HIGH_R;
    const stripes = canvasTex(
      256,
      32,
      (c, w, h) => {
        for (let k = 0; k < 8; k++) {
          c.fillStyle = k % 2 ? "#ffffff" : low ? "#ff3d5a" : "#2f8dff";
          c.fillRect((k * w) / 8, 0, w / 8, h);
        }
      },
      true,
    );
    stripes.repeat.set(3, 1);
    const mat = new THREE.MeshToonMaterial({ map: stripes });
    const len = R - HUB + 0.5;
    const geo = new THREE.CylinderGeometry(r, r, len, 14);
    geo.rotateZ(Math.PI / 2);
    if (low)
      for (const side of [1, -1]) {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(side * (HUB + len / 2 - 0.1), y, 0);
        m.castShadow = true;
        g.add(m);
        ball(g, "#ff3d5a", r * 1.25, { x: side * (HUB + len - 0.1), y });
      }
    else {
      // split: the inner half on one side, the outer half on the other (held by a crane above)
      const inner = new THREE.CylinderGeometry(r, r, MID - HUB + 0.1, 14);
      inner.rotateZ(Math.PI / 2);
      const outer = new THREE.CylinderGeometry(r, r, R + 0.4 - MID, 14);
      outer.rotateZ(Math.PI / 2);
      const a = new THREE.Mesh(inner, mat);
      a.position.set((HUB + MID) / 2, y, 0);
      const b = new THREE.Mesh(outer, mat);
      b.position.set(-(MID + R + 0.4) / 2, y, 0);
      a.castShadow = b.castShadow = true;
      g.add(a, b);
      ball(g, "#2f8dff", r * 1.25, { x: MID, y });
      ball(g, "#2f8dff", r * 1.25, { x: -MID, y });
      ball(g, "#2f8dff", r * 1.25, { x: -(R + 0.4), y });
      cyl(g, "#c8d8ff", 0.07, 2.75 - y, { x: -MID, y: (2.75 + y) / 2, seg: 8 });
      cyl(g, "#c8d8ff", 0.07, MID, { x: -MID / 2, y: 2.75, rz: Math.PI / 2, seg: 8 });
    }
    // a collar on the hub
    cyl(g, low ? "#ff3d5a" : "#2f8dff", HUB * 0.82, r * 2.4, { y, seg: 24 });
    return { g, ang: low ? 0 : Math.PI / 2, omega: 0, dir: 1, warn: 0, active: true, low, y, arms: low ? 2 : 1 };
  }

  // ------------------------------------------------------------ helpers

  /** Which side of the split high bar sweeps radius r: 0 = the inner arm, π = the outer one. */
  private highOff(r: number) {
    return r < MID ? 0 : Math.PI;
  }
  /** Seconds until an arm of bar b reaches the angle `a` (at radius r), with angular speed `om`. */
  private etaBar(b: Bar, a: number, om: number, r = 4) {
    if (Math.abs(om) < 0.05) return Infinity;
    // the bar's world angle: its local +x axis turned by rotation.y = -ang
    const per = b.arms === 2 ? Math.PI : TAU;
    const off = b.arms === 2 ? 0 : this.highOff(r);
    const d = om > 0 ? mod(a - b.ang - off, per) : mod(b.ang + off - a, per);
    return d / Math.abs(om);
  }
  private polar(d: Dancer) {
    return { a: Math.atan2(d.z, d.x), r: Math.hypot(d.x, d.z) };
  }

  // ------------------------------------------------------------ CPUs

  protected cpu(i: number, dt: number): CpuPad {
    const me = this.ds[i];
    if (me.out) return {};
    const lv = this.players[i].level;
    const b = this.brains[i];
    const { a, r } = this.polar(me);
    const out: CpuPad = {};
    const etas = this.bars.map((bar, k) => {
      b.believed[k] = damp(b.believed[k], bar.omega, 2 + 9 * lv, dt);
      return bar.active ? this.etaBar(bar, a, b.believed[k], r) : Infinity;
    });
    const [eLow, eHigh] = etas;
    // jump the low bar
    const lowId = Math.round(this.bars[0].ang / Math.PI + (this.bars[0].omega > 0 ? 0.5 : -0.5));
    if (b.lowPlan !== lowId && eLow > 0.6) {
      b.lowPlan = lowId;
      const g = (Math.random() + Math.random() + Math.random() - 1.5) * 2;
      b.jumpAt = clamp(0.27 + g * (0.03 + (1 - lv) * 0.08), 0.06, 0.5);
    }
    if (!me.air && eLow <= b.jumpAt && !(eHigh < 0.35)) out.a = true;
    // duck under the high bar
    if (eHigh < 0.3 + 0.25 * (1 - lv) && !(eLow < 0.25 && eLow < eHigh)) out.b = true;
    // move: away from a double hit, else back home and away from the others
    let tx = 0,
      tz = 0;
    const tanX = -Math.sin(a),
      tanZ = Math.cos(a);
    const horizon = 0.6 + 1.6 * lv;
    if (Number.isFinite(eHigh) && Math.abs(eLow - eHigh) < 0.6 && Math.min(eLow, eHigh) < horizon) {
      // both bars would reach us together: cross the circle, the other half of the high bar comes much later
      if (Math.abs(b.homeR - r) < 0.5 || (b.homeR < MID) === (r < MID)) {
        b.homeR = r < MID ? MID + 1.2 : MID - 1.3;
        b.wander = 2.5;
      }
    } else {
      b.wander -= dt;
      if (b.wander <= 0) {
        b.wander = 1.5 + Math.random() * 2;
        b.homeR = Math.random() < 0.5 ? 2.4 + Math.random() * 1.3 : 5.0 + Math.random() * 1.4;
      }
    }
    // keep apart from the others
    let push = 0;
    for (let j = 0; j < this.ds.length; j++) {
      if (j === i || this.ds[j].out) continue;
      const o = this.polar(this.ds[j]);
      const d = angDiff(o.a, a);
      if (Math.abs(d) < 0.9) push += Math.sign(d || 1) * (0.9 - Math.abs(d));
    }
    tx += tanX * clamp(push * 2, -1, 1) * 0.6;
    tz += tanZ * clamp(push * 2, -1, 1) * 0.6;
    const dr = b.homeR - r;
    if (Math.abs(dr) > 0.25) {
      tx += (me.x / (r || 1)) * Math.sign(dr);
      tz += (me.z / (r || 1)) * Math.sign(dr);
    }
    out.x = tx;
    out.y = tz;
    return out;
  }

  // ------------------------------------------------------------ the game

  protected idle(dt: number) {
    this.animFair(dt);
    this.bars[0].omega = damp(this.bars[0].omega, 0.5, 2, dt);
    this.bars[0].ang += this.bars[0].omega * dt;
    this.bars[0].g.rotation.y = -this.bars[0].ang;
    this.moveCam(CAM, LOOK, dt, 1.6);
  }

  protected step(dt: number) {
    const left = TIME - this.t;
    this.hud.timer(left);
    this.animFair(dt);
    this.moveCam(CAM, LOOK, dt, 3);

    // ---- bar speeds
    const [low, high] = this.bars;
    const lowSpeed = 1.05 + 1.4 * (this.t / TIME);
    const highSpeed = 1.0 + 0.9 * clamp((this.t - HIGH_AT) / (TIME - HIGH_AT), 0, 1);
    if (!this.highShown && this.t >= HIGH_AT - 1.5) {
      this.highShown = true;
      high.g.visible = true;
      high.dir = -1;
      this.hud.banner(T("HIGH BAR!", "高杆来了！"), { color: "#5ff3ff", ms: 1500, sub: T("Hold B to duck", "按住 B 蹲下") });
      this.hud.tip(T("Tip: the high bar is split. Cross the circle to dodge it!", "提示：高杆分成两半，跨过圆圈就能躲开！"));
      this.sound("warp");
    }
    if (this.highShown && !high.active) {
      // rises out of the hub
      const p = clamp((this.t - (HIGH_AT - 1.5)) / 1.5, 0, 1);
      high.g.position.y = (p - 1) * HIGH_Y;
      if (p >= 1) high.active = true;
    }
    if (this.highShown && this.t > HIGH_AT + 6) this.hud.tip(null);
    if (!this.hurried && left <= 10) {
      this.hurried = true;
      this.hud.banner(T("10 SECONDS LEFT!", "还剩 10 秒！"), { color: "#ffd23f", ms: 1000 });
      music.speed(1.15);
    }
    // turn-backs: warned by the red lamp
    if (this.t >= this.nextFlip && this.endT < 0) {
      const b = high.active && this.rnd() < 0.45 ? high : low;
      b.warn = 0.9;
      this.nextFlip = this.t + 8 + this.rnd() * 5;
      this.hud.banner(T("REVERSE!", "反转！"), { color: "#ff5a6a", ms: 800, size: 7 });
      this.sound("buzzer");
    }
    let warning = false;
    for (const b of this.bars) {
      if (b.warn > 0) {
        warning = true;
        b.warn -= dt;
        if (b.warn <= 0) b.dir = -b.dir;
      }
      const sp = (b.low ? lowSpeed : highSpeed) * b.dir;
      if (b === high && !this.highShown) continue;
      b.omega = damp(b.omega, sp, b.warn > 0 ? 0.6 : 3.2, dt);
    }
    this.hubLamp.material = warning && Math.floor(this.t * 10) % 2 ? this.lampWarn : this.lampOn;

    // ---- the bars turn: sweep test against every dancer
    for (const b of this.bars) {
      const before = b.ang;
      b.ang += b.omega * dt;
      b.g.rotation.y = -b.ang;
      if (!b.active) continue;
      this.ds.forEach((d, i) => {
        if (d.out) return;
        const { a, r } = this.polar(d);
        if (r < HUB - 0.2 || r > R + 0.6) return;
        // did an arm's centre line sweep over this player this frame?
        const s0 = angDiff(before, a),
          s1 = angDiff(b.ang, a);
        const s0b = angDiff(before + Math.PI, a),
          s1b = angDiff(b.ang + Math.PI, a);
        const crossed = (x0: number, x1: number) => Math.sign(x0) !== Math.sign(x1) && Math.abs(x0 - x1) < 1.5;
        const armA = b.arms === 2 || r < MID + 0.25,
          armB = b.arms === 2 || r > MID - 0.25;
        if (!(armA && crossed(s0, s1)) && !(armB && crossed(s0b, s1b))) return;
        const feet = d.y;
        const head = d.y + (d.duck > 0.5 ? 0.82 : 1.45);
        const hit = b.low ? feet < LOW_Y + LOW_R - 0.02 : head > HIGH_Y - HIGH_R && feet < HIGH_Y + HIGH_R;
        if (hit) this.fling(i, b, a, r);
      });
    }

    // ---- the dancers
    this.ds.forEach((d, i) => {
      const av = this.avatars[i];
      if (d.out) {
        this.stepOut(d, i, dt);
        return;
      }
      const p = this.pad(i);
      d.duck = damp(d.duck, p.b ? 1 : 0, 22, dt);
      const sp = SPEED * (p.b ? 0.45 : 1) * (d.air ? 0.8 : 1);
      const k = 1 - Math.exp(-10 * dt);
      d.vx += (p.x * sp - d.vx) * k;
      d.vz += (p.y * sp - d.vz) * k;
      if (p.aDown && !d.air) {
        d.air = true;
        d.vy = JUMP_V;
        this.sound("jump");
      }
      if (d.air) {
        d.y += (d.vy - GRAV * dt * 0.5) * dt;
        d.vy -= GRAV * dt;
        if (d.y <= 0) {
          d.y = 0;
          d.vy = 0;
          d.air = false;
          this.fx.dust({ x: d.x, y: 0, z: d.z }, 4);
        }
      }
      d.x += d.vx * dt;
      d.z += d.vz * dt;
      // stay on the stage, off the hub
      const r = Math.hypot(d.x, d.z);
      const rr = clamp(r, HUB + 0.55, R - 0.5);
      if (r > 1e-4 && rr !== r) {
        d.x *= rr / r;
        d.z *= rr / r;
      }
      const v = Math.hypot(d.vx, d.vz);
      if (v > 0.4) av.face(Math.atan2(d.vx, d.vz), dt);
      else av.face(0, dt, 4);
      av.anim = d.air ? "jump" : v > 0.5 ? "run" : "idle";
      av.speed = clamp(v / SPEED, 0, 1);
      const sq = 1 - d.duck * 0.45;
      av.model.scale.set(1 + d.duck * 0.18, sq, 1 + d.duck * 0.18);
      av.pos.set(d.x, d.y, d.z);
    });
    // bumps
    for (let i = 0; i < this.ds.length; i++)
      for (let j = i + 1; j < this.ds.length; j++) {
        const A = this.ds[i],
          B = this.ds[j];
        if (A.out || B.out) continue;
        const dx = B.x - A.x,
          dz = B.z - A.z;
        const dd = Math.hypot(dx, dz);
        if (dd < PR * 2 && dd > 1e-4) {
          const push = (PR * 2 - dd) / 2;
          A.x -= (dx / dd) * push;
          A.z -= (dz / dd) * push;
          B.x += (dx / dd) * push;
          B.z += (dz / dd) * push;
        }
      }

    // ---- the end
    const alive = this.ds.filter((d) => !d.out).length;
    if ((alive <= 1 || left <= 0) && this.endT < 0) this.endT = this.t;
    if (this.endT >= 0 && (this.t - this.endT > 1.0 || left <= 0)) this.endGame();
  }

  /** Hit by a bar: thrown off the stage, tumbling, into the pool. */
  private fling(i: number, b: Bar, a: number, r: number) {
    const d = this.ds[i];
    d.out = true;
    d.outT = this.t;
    d.flying = true;
    const s = Math.sign(b.omega || 1);
    // the bar's motion at that point, plus outward
    const tx = -Math.sin(a) * s,
      tz = Math.cos(a) * s;
    const sp = Math.abs(b.omega) * r + 6;
    d.vx = tx * sp + Math.cos(a) * 4;
    d.vz = tz * sp + Math.sin(a) * 4;
    d.vy = 7.5;
    d.spin = (Math.random() < 0.5 ? -1 : 1) * 9;
    const av = this.avatars[i];
    av.anim = "fall";
    av.flash();
    av.setRing(null);
    av.model.scale.set(1, 1, 1);
    this.hud.mark(this.players[i].seat, "out");
    this.hud.setScore(this.players[i].seat, T("Splash!", "扑通！"));
    this.sound("hit");
    this.sound("boing");
    this.shake = 0.45;
    this.buzz(i, [100, 40, 100]);
    this.fx.burst({ x: d.x, y: b.y + 0.4, z: d.z }, { count: 18, colors: ["#ffffff", "#ffe14a", b.low ? "#ff3d5a" : "#2f8dff"], speed: 6, size: 0.18 });
    this.fx.ring({ x: d.x, y: b.y, z: d.z }, "#ffffff", 1.6, 0.35);
  }

  /** Out players fly into the pool, then swim lazily around the stage. */
  private stepOut(d: Dancer, i: number, dt: number) {
    const av = this.avatars[i];
    if (d.flying) {
      d.vy -= 22 * dt;
      d.x += d.vx * dt;
      d.z += d.vz * dt;
      d.y += d.vy * dt;
      const r = Math.hypot(d.x, d.z);
      if (r > 17.5) {
        d.x *= 17.5 / r;
        d.z *= 17.5 / r;
        d.vx *= -0.3;
        d.vz *= -0.3;
      }
      // bounce off the stage's side if still above it
      if (r < R + 0.4 && d.y < 0.2) {
        d.y = 0.2;
        d.vy = Math.abs(d.vy) * 0.4;
      }
      av.model.rotation.x += d.spin * dt;
      av.groundY = r < R ? 0 : WATER_Y;
      av.pos.set(d.x, d.y, d.z);
      if (d.y < WATER_Y - 0.3 && r >= R) {
        d.flying = false;
        d.swimA = Math.atan2(d.z, d.x);
        d.swimR = Math.max(R + 1.4, Math.min(16, r));
        av.model.rotation.x = 0;
        this.fx.splash({ x: d.x, y: WATER_Y + 0.2, z: d.z });
        this.sound("splash");
      }
      return;
    }
    d.swimA += dt * 0.25 * (i % 2 ? 1 : -1);
    d.x = damp(d.x, Math.cos(d.swimA) * d.swimR, 2, dt);
    d.z = damp(d.z, Math.sin(d.swimA) * d.swimR, 2, dt);
    av.pos.set(d.x, WATER_Y - 0.55 + Math.sin(this.t * 3 + i) * 0.05, d.z);
    av.groundY = WATER_Y + 10; // no blob shadow in the water
    av.anim = "swim";
    const dir = i % 2 ? 1 : -1;
    av.face(Math.atan2(-Math.sin(d.swimA) * dir, Math.cos(d.swimA) * dir), dt, 3);
  }

  private endGame() {
    const place = this.ds.map((d) => 1 + this.ds.filter((o) => (d.out ? !o.out || o.outT > d.outT + 1e-6 : false)).length);
    this.ds.forEach((d, i) => {
      if (!d.out) this.hud.mark(this.players[i].seat, "win");
    });
    this.finish(place);
  }

  private animFair(dt: number) {
    const t = this.t + this.clock;
    this.clock += dt;
    this.waterTex.offset.x += dt * 0.02;
    this.waterTex.offset.y += dt * 0.012;
    this.wheel.rotation.z += dt * 0.12;
    this.canopy.rotation.y += dt * 1.5;
    this.ducks.forEach((g, k) => {
      const a = (k / 5) * TAU + 0.4 + t * 0.05;
      g.position.set(Math.cos(a) * (12 + (k % 2) * 3), WATER_Y + Math.sin(t * 2 + k) * 0.06, Math.sin(a) * (12 + (k % 2) * 3));
      g.rotation.y = -a;
    });
    // chasing bulbs
    const ph = Math.floor(t * 8);
    for (let k = 0; k < 48; k++) this.bulbs.setColorAt(k, this.bulbCols[(k + ph) % 4 === 0 ? 3 : k % 3]);
    if (this.bulbs.instanceColor) this.bulbs.instanceColor.needsUpdate = true;
  }
  private clock = 0;

  protected outroStep(dt: number) {
    const live = this.ds.filter((d) => !d.out);
    if (live.length) {
      const cx = live.reduce((s, d) => s + d.x, 0) / live.length,
        cz = live.reduce((s, d) => s + d.z, 0) / live.length;
      const k = live.length > 1 ? 0.35 : 0.7;
      this.moveCam([cx * k * 0.6, 12 - k * 3, cz * k + 13 - k * 3], [cx * k, 0.3, cz * k], dt, 1.5);
    }
    this.animFair(dt);
    for (const b of this.bars) {
      b.omega = damp(b.omega, 0, 1.2, dt);
      b.ang += b.omega * dt;
      b.g.rotation.y = -b.ang;
    }
    this.ds.forEach((d, i) => {
      const av = this.avatars[i];
      if (d.out) {
        this.stepOut(d, i, dt);
        return;
      }
      d.vy -= GRAV * dt;
      d.y = Math.max(0, d.y + d.vy * dt);
      if (d.y === 0) d.vy = 0;
      av.pos.set(d.x, d.y, d.z);
      av.model.scale.set(1, 1, 1);
      av.face(0, dt, 5);
      if (Math.random() < dt * 1.2) this.fx.confetti({ x: d.x, y: 3, z: d.z }, 16);
    });
  }
}

const def: MiniDef = {
  id: "barre-tournante",
  name: "Hash Sweeper",
  icon: "🌀",
  color: "#9b5cff",
  tagline: "Jump the low bar, duck the high one.",
  rules: "Jump the bar sweeping the floor (A) and duck under the high one (hold B). Hit = into the water! Last one standing wins.",
  controls: { stick: "Move", a: "Jump", b: "Duck (hold)" },
  modes: ["ffa"],
  length: 60,
  music: "mini3",
  create: (ctx) => new BarreTournante(ctx),
};
export default def;
