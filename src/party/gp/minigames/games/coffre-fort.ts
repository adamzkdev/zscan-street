/**
 * LE COFFRE-FORT (1 contre 3, 40 s): a bank vault with a heap of gold in the middle. The three
 * thieves grab coins at the heap (A, up to 3 at once, slower when loaded) and carry them to a getaway
 * van through the holes in the side walls. The guard (the solo) tags them: a tagged thief drops
 * everything (the coins fly back to the heap) and is stunned for 2 s. The guard's A = a dive.
 * The trio wins by depositing the target before the end; otherwise the guard wins.
 */
import * as THREE from "three";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef } from "../types";
import { ball, box, canvasTex, coinMesh, cone, cyl, flat, group, textSprite, toon } from "../../engine/gfx";
import { clamp, dist2 } from "../../engine/util";
import { music } from "../../engine/audio";
import type { Avatar } from "../../engine/chars3d";
import { COIN } from "../../engine/hud";
import { T } from "../../../../i18n/lang";

const TIME = 40;
const HX = 11; // vault half-size
const HZ = 7;
const PILE_R = 1.2; // the heap (an obstacle)
const GRAB_R = PILE_R + 1.1; // close enough to grab
const HOLE_Z = 1.9; // the holes in the side walls (|z| < HOLE_Z)
const VAN_X = HX + 0.2; // depositing zone: |x| > VAN_X - 1.4
const PR = 0.42;
const T_SPEED = 6.0; // thieves (empty)
const LOAD_SLOW = 0.5; // speed lost per coin
const MAX_LOAD = 3;
const GRAB_CD = 0.3;
const G_SPEED = 5.9; // the guard
const DIVE_V = 13;
const DIVE_T = 0.24;
const DIVE_CD = 1.8;
const STUN = 2;
const SAFE = 1.2;
const TARGET = 17;
const PILLARS: [number, number][] = [
  [-5.5, -3.6],
  [5.5, -3.6],
  [-5.5, 3.6],
  [5.5, 3.6],
];
const PILLAR_R = 0.65;

interface Body {
  x: number;
  z: number;
  vx: number;
  vz: number;
}
interface Thief extends Body {
  load: number;
  stun: number;
  safe: number;
  grabCd: number;
  banked: number;
  coins: THREE.Object3D[];
  /** CPU */
  van: number;
  think: number;
  goalX: number;
  goalZ: number;
}
interface Flyer {
  o: THREE.Object3D;
  x0: number;
  z0: number;
  y0: number;
  x1: number;
  z1: number;
  y1: number;
  t: number;
  dur: number;
  toVan: boolean;
}

class CoffreFort extends BaseMini {
  private th: Thief[] = [];
  private gd = { x: 0, z: -4.5, vx: 0, vz: 0, diveT: 0, diveCd: 0, tags: 0 };
  private banked = 0;
  private coinTpl!: THREE.Object3D;
  private flyers: Flyer[] = [];
  private pile!: THREE.Group;
  private vans: THREE.Group[] = [];
  private vanBounce = [0, 0];
  private bar!: HTMLElement;
  private barFill!: HTMLElement;
  private barTxt!: HTMLElement;
  private hurried = false;
  private over = 0;
  private winner = -1;
  private alarm!: THREE.Mesh[];
  private tipEl: HTMLElement | null = null;
  private glint = 0;
  /** The guard's cap and the thieves' beanies, sat on each zkSNARK's hood (its art may load late). */
  private hats: { a: Avatar; o: THREE.Object3D; w: number }[] = [];
  // CPU guard
  private gTarget = -1;
  private gThink = 0;

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#141a2a", "#2a3550"], size: 18, sun: [0.35, 1, 0.5], hemi: ["#fff4dc", "#5a5a7a", 1.7], fog: { near: 50, far: 110 } });
    this.coinTpl = coinMesh(0.3);
    this.buildVault();
    // the guard at the top, the thieves at the bottom
    const ga = this.spawn(0, 0, -4.5, 0);
    ga.setRing(this.players[0].char.color);
    this.hats.push({ a: ga, o: this.guardHat(ga.rig.head), w: 0.7 });
    const starts = [
      [-6, 5.3],
      [0, 5.6],
      [6, 5.3],
    ];
    for (let k = 1; k < this.players.length; k++) {
      const [x, z] = starts[(k - 1) % 3];
      const a = this.spawn(k, x, z, Math.PI);
      a.setRing(this.players[k].char.color);
      // a black burglar's beanie
      const cap = group(a.rig.head);
      box(cap, "#1a1a22", 0.74, 0.16, 0.56, { y: 0.05 });
      box(cap, "#2c2c38", 0.76, 0.07, 0.58, { y: -0.03 });
      ball(cap, "#2c2c38", 0.08, { y: 0.17, lo: true });
      this.hats.push({ a, o: cap, w: 0.7 });
      const coins: THREE.Object3D[] = [];
      for (let c = 0; c < MAX_LOAD; c++) {
        const o = this.coinTpl.clone();
        o.visible = false;
        this.scene.add(o);
        coins.push(o);
      }
      this.th[k] = { x, z, vx: 0, vz: 0, load: 0, stun: 0, safe: 0, grabCd: 0, banked: 0, coins, van: x < 0 ? -1 : 1, think: 0, goalX: 0, goalZ: 0 };
    }
    this.hud.players(this.players, (p) => (p.team === 0 ? this.tagsTxt(0) : `${COIN} 0`), { teams: true });
    this.hud.timer(TIME);
    // the loot bar under the timer
    this.bar = this.hud.add(
      `<div style="position:absolute;left:50%;top:calc(var(--u)*7.8);transform:translateX(-50%);width:calc(var(--u)*30);height:calc(var(--u)*3.2);background:rgba(20,14,40,0.8);border:calc(var(--u)*0.3) solid #ffd23f;border-radius:999px;overflow:hidden">
        <div class="fill" style="position:absolute;left:0;top:0;bottom:0;width:0%;background:linear-gradient(#ffe46a,#f0a800);transition:width 0.25s"></div>
        <div class="txt" style="position:absolute;inset:0;display:grid;place-items:center;font-family:var(--title);font-size:calc(var(--u)*2);color:#fff;-webkit-text-stroke:calc(var(--u)*0.15) #1d1630;paint-order:stroke fill"><span>${COIN} 0 / ${TARGET}</span></div>
      </div>`,
    );
    this.barFill = this.bar.querySelector(".fill") as HTMLElement;
    this.barTxt = this.bar.querySelector(".txt") as HTMLElement;
    this.setCam([0, 30, 24], [0, 0, 0.5], 42);
  }

  /** The guard's card: how many thieves it tagged. */
  private tagsTxt(n: number) {
    return T(`👮 ${n} tag${n === 1 ? "" : "s"}`, `👮 抓到 ${n} 次`);
  }

  /** Each hat on its zkSNARK's hood top, sized to it. */
  private placeHats() {
    for (const h of this.hats) {
      const b = h.a.snark.headBox;
      if (b.isEmpty()) continue;
      h.o.position.set((b.min.x + b.max.x) / 2, b.max.y - 0.04, (b.min.z + b.max.z) / 2);
      h.o.scale.setScalar(clamp((b.max.x - b.min.x) / h.w, 0.85, 1.5));
    }
  }

  private guardHat(head: THREE.Object3D) {
    const cap = group(head, { rx: -0.12 });
    cyl(cap, "#1f2d5a", 0.4, 0.22, { y: 0.06, seg: 18 });
    cyl(cap, "#1f2d5a", 0.44, 0.05, { y: 0.18, seg: 18 });
    box(cap, "#111a38", 0.5, 0.04, 0.3, { y: -0.04, z: 0.38 });
    ball(cap, "#ffd23f", [0.08, 0.1, 0.03], { y: 0.08, z: 0.4 });
    return cap;
  }

  // ------------------------------------------------------------ the vault

  private buildVault() {
    const s = this.scene;
    // marble floor
    const tex = canvasTex(1024, 640, (g, w, h) => {
      const n = 22,
        m = 14;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < m; j++) {
          g.fillStyle = (i + j) % 2 ? "#e9e2d2" : "#c9bfa8";
          g.fillRect((i * w) / n, (j * h) / m, w / n + 1, h / m + 1);
        }
      g.strokeStyle = "rgba(255,255,255,0.25)";
      g.lineWidth = 2;
      for (let k = 0; k < 30; k++) {
        g.beginPath();
        const x = (k * 137) % w,
          y = (k * 89) % h;
        g.moveTo(x, y);
        g.bezierCurveTo(x + 30, y + 20, x + 50, y - 10, x + 90, y + 15);
        g.stroke();
      }
      // a golden inlay ring around the heap
      g.strokeStyle = "#d9a400";
      g.lineWidth = 10;
      g.beginPath();
      g.arc(w / 2, h / 2, (GRAB_R / (2 * HX)) * w, 0, Math.PI * 2);
      g.stroke();
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * HX, 2 * HZ), new THREE.MeshToonMaterial({ map: tex }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);
    // outside (the street where the vans wait)
    const street = new THREE.Mesh(new THREE.PlaneGeometry(120, 80), toon("#3a3f4e"));
    street.rotation.x = -Math.PI / 2;
    street.position.y = -0.02;
    street.receiveShadow = true;
    s.add(street);
    for (const sx of [-1, 1]) for (let z = -6; z <= 6; z += 3) box(s, flat("#e8e0c0"), 0.25, 0.02, 1.4, { x: sx * (HX + 5.4), y: 0.01, z, cast: false });

    // thick steel walls, with holes on the sides
    const wall = "#6f7d96",
      trim = "#55617a",
      H = 2.4,
      WT = 1.0;
    box(s, wall, 2 * HX + 2 * WT, H, WT, { y: H / 2, z: -HZ - WT / 2 });
    box(s, wall, 2 * HX + 2 * WT, H * 0.45, WT, { y: (H * 0.45) / 2, z: HZ + WT / 2 });
    for (const sx of [-1, 1]) {
      const len = HZ - HOLE_Z;
      box(s, wall, WT, H, len, { x: sx * (HX + WT / 2), y: H / 2, z: -HOLE_Z - len / 2 });
      box(s, wall, WT, H, len, { x: sx * (HX + WT / 2), y: H / 2, z: HOLE_Z + len / 2 });
      // broken bricks around the hole
      for (let k = 0; k < 6; k++) box(s, "#8a94a8", 0.4, 0.3, 0.4, { x: sx * (HX + 0.4 + (k % 2) * 0.6), y: 0.15, z: -HOLE_Z + 0.4 + k * 0.6, ry: k });
    }
    for (let x = -HX; x <= HX; x += 2.2) box(s, trim, 0.25, H, 0.1, { x, y: H / 2, z: -HZ + 0.02, cast: false });
    // rivets
    for (let x = -HX + 1; x < HX; x += 1.1) ball(s, "#a8b4c8", 0.07, { x, y: H - 0.2, z: -HZ + 0.06, lo: true, cast: false });

    // the giant vault door, open, at the top
    const door = group(s, { x: -5.6, y: 0, z: -HZ - 0.2 });
    const disc = cyl(door, "#a9b4c6", 2.4, 0.5, { y: 2.4, rx: Math.PI / 2, ry: 0.9, seg: 32 });
    disc.castShadow = true;
    const wheel = group(door, { y: 2.4, z: 0.4, ry: 0.9 });
    for (let k = 0; k < 3; k++) box(wheel, "#ffd23f", 2.2, 0.16, 0.16, { rz: (k / 3) * Math.PI });
    ball(wheel, "#ffd23f", 0.25);
    // safety-deposit boxes on the back wall
    for (let i = 0; i < 9; i++)
      for (let j = 0; j < 3; j++) {
        const x = 0.8 + i * 1.05,
          y = 0.5 + j * 0.62;
        box(s, "#b8a46a", 0.95, 0.55, 0.12, { x, y, z: -HZ + 0.08, cast: false });
        ball(s, "#4a3c1e", 0.05, { x: x + 0.3, y, z: -HZ + 0.16, lo: true, cast: false });
      }
    // the vault's name over its back wall
    const sign = textSprite(T("SHIELDED VAULT", "屏蔽金库"), 0.95, { color: "#1d1630", bg: "#ffc928" });
    sign.position.set(6.8, H + 0.75, -HZ - 0.3);
    s.add(sign);
    // alarm lights
    this.alarm = [];
    for (const x of [-9, 9]) {
      const m = ball(s, flat("#ff3b3b"), 0.32, { x, y: H + 0.3, z: -HZ - 0.1, cast: false });
      this.alarm.push(m);
    }

    // pillars
    for (const [x, z] of PILLARS) {
      cyl(s, "#e6dcc6", PILLAR_R, 2.6, { x, y: 1.3, z, seg: 16 });
      cyl(s, "#cbbf9f", PILLAR_R + 0.15, 0.3, { x, y: 0.15, z, seg: 16 });
      cyl(s, "#cbbf9f", PILLAR_R + 0.15, 0.3, { x, y: 2.6, z, seg: 16 });
    }

    // the heap of gold (instanced coins) and gold bars
    this.pile = group(s);
    const coinGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.07, 14);
    const n = 150;
    const MH = 1.7; // the mound's height
    const inst = new THREE.InstancedMesh(coinGeo, toon("#ffc928", "#7a5200", 0.35), n);
    const m4 = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      e = new THREE.Euler();
    const slope = Math.atan2(MH, PILE_R);
    for (let k = 0; k < n; k++) {
      const r = Math.sqrt(this.rnd()) * PILE_R * 1.05;
      const a = this.rnd() * Math.PI * 2;
      const y = Math.max(0.04, (1 - r / PILE_R) * MH) + 0.02;
      // lying on the slope, facing outward
      e.set(0, -a, 0, "YXZ");
      q.setFromEuler(e);
      const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(Math.sin(a), 0, -Math.cos(a)).normalize(), -(slope + (this.rnd() - 0.5) * 0.6));
      tilt.multiply(q);
      m4.compose(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r), tilt, new THREE.Vector3(1, 1, 1));
      inst.setMatrixAt(k, m4);
    }
    inst.castShadow = true;
    this.pile.add(inst);
    cone(this.pile, toon("#f2b51e", "#7a5200", 0.3), PILE_R * 0.97, MH, { y: MH / 2 });
    // gold bars on top and around, and money bags
    for (let k = 0; k < 3; k++) box(this.pile, toon("#ffd75e", "#8a6200", 0.35), 0.6, 0.2, 0.3, { x: (k - 1) * 0.18, y: MH - 0.1 + (k === 1 ? 0.2 : 0), z: (k % 2) * 0.1, ry: k * 0.7 });
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3;
      box(this.pile, toon("#ffd75e", "#8a6200", 0.3), 0.7, 0.25, 0.35, { x: Math.cos(a) * (PILE_R + 0.2), y: 0.13, z: Math.sin(a) * (PILE_R + 0.2), ry: -a });
    }
    // big ⓩ coins stuck in the heap
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + 0.6;
      const r = PILE_R * (k % 2 ? 0.45 : 0.62);
      const c = coinMesh(0.34);
      c.position.set(Math.cos(a) * r, (1 - r / PILE_R) * MH + 0.18, Math.sin(a) * r);
      c.rotation.set(-0.35, Math.PI / 2 - a, 0);
      this.pile.add(c);
    }
    for (const [x, z] of [
      [-1.1, 0.7],
      [1.05, -0.75],
    ]) {
      ball(this.pile, "#c8a46a", [0.32, 0.35, 0.32], { x, y: 0.33, z });
      cone(this.pile, "#c8a46a", 0.13, 0.25, { x, y: 0.75, z });
      box(this.pile, flat("#5a3a1e"), 0.24, 0.05, 0.24, { x, y: 0.64, z, cast: false });
    }
    // the getaway vans
    for (const sx of [-1, 1]) {
      const v = group(s, { x: sx * (HX + 3.6), z: 0 });
      const body = group(v);
      box(body, "#e8e8f0", 2.6, 2.2, 4.6, { y: 1.5 });
      box(body, "#3d8bff", 2.62, 0.4, 4.62, { y: 1.1 });
      box(body, "#e8e8f0", 2.4, 1.4, 1.6, { y: 1.1, z: 3.0 });
      box(body, flat("#7ec8ff"), 2.2, 0.6, 0.05, { y: 1.5, z: 3.81, cast: false });
      // open back doors toward the hole
      box(body, flat("#1a1a22"), 0.05, 1.9, 4.2, { x: -sx * 1.31, y: 1.5, cast: false });
      for (const dz of [-1, 1]) box(body, "#d8d8e0", 1.0, 1.9, 0.08, { x: -sx * 1.8, y: 1.5, z: dz * 1.9, ry: dz * sx * 0.9 });
      for (const [wx, wz] of [
        [-1.2, -1.5],
        [1.2, -1.5],
        [-1.2, 2.7],
        [1.2, 2.7],
      ])
        cyl(v, "#222228", 0.5, 0.35, { x: wx, y: 0.5, z: wz, rz: Math.PI / 2, seg: 14 });
      // a little ramp
      box(v, "#8a8a96", 1.6, 0.1, 2.2, { x: -sx * 1.9, y: 0.25, rz: sx * 0.25 });
      this.vans.push(body as THREE.Group);
    }
  }

  // ------------------------------------------------------------ helpers

  private solid(b: Body) {
    for (const [x, z] of [...PILLARS, [0, 0] as [number, number]]) {
      const r = (x === 0 && z === 0 ? PILE_R : PILLAR_R) + PR;
      const dx = b.x - x,
        dz = b.z - z,
        d = Math.hypot(dx, dz);
      if (d < r) {
        b.x = x + (dx / (d || 1)) * r;
        b.z = z + (dz / (d || 1)) * r;
      }
    }
    b.z = clamp(b.z, -HZ + PR, HZ - PR);
    // side walls, except the holes (which lead to the vans)
    const inHole = Math.abs(b.z) < HOLE_Z - PR;
    if (inHole) b.x = clamp(b.x, -VAN_X - 0.4, VAN_X + 0.4);
    else b.x = clamp(b.x, -HX + PR, HX + -PR);
    if (Math.abs(b.x) > HX - PR && !inHole) b.x = Math.sign(b.x) * (HX - PR);
  }

  private setLoad(i: number) {
    const t = this.th[i];
    t.coins.forEach((c, k) => (c.visible = k < t.load));
  }

  private flyCoin(o: THREE.Object3D, from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }, dur: number, toVan: boolean) {
    this.flyers.push({ o, x0: from.x, y0: from.y, z0: from.z, x1: to.x, y1: to.y, z1: to.z, t: 0, dur, toVan });
  }

  private updateBar() {
    const k = clamp(this.banked / TARGET, 0, 1);
    this.barFill.style.width = `${k * 100}%`;
    this.barTxt.innerHTML = `<span>${COIN} ${this.banked} / ${TARGET}</span>`;
    // the heap shrinks as it's emptied
    this.pile.scale.set(1, 1 - 0.55 * k, 1);
  }

  // ------------------------------------------------------------ CPUs

  protected cpu(i: number, _dt: number): CpuPad {
    const lv = this.players[i].level;
    return i === 0 ? this.cpuGuard(lv) : this.cpuThief(i, lv);
  }

  /** Steering toward (tx, tz) around the pillars and the heap, away from a threat. */
  private steer(b: Body, tx: number, tz: number, avoid?: { x: number; z: number; w: number }) {
    let dx = tx - b.x,
      dz = tz - b.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d;
    dz /= d;
    for (const [x, z] of [...PILLARS, [0, 0] as [number, number]]) {
      const r = (x === 0 && z === 0 ? PILE_R : PILLAR_R) + PR + 0.6;
      const ox = b.x - x,
        oz = b.z - z,
        od = Math.hypot(ox, oz);
      if (od < r + 0.8 && od > 0.01 && Math.hypot(tx - x, tz - z) > r - 0.3) {
        // slide along the obstacle (tangent on the side of the target)
        const tgx = -oz / od,
          tgz = ox / od;
        const s = tgx * dx + tgz * dz >= 0 ? 1 : -1;
        const w = clamp((r + 0.8 - od) / 0.8, 0, 1);
        dx += (tgx * s + (ox / od) * 0.5) * w;
        dz += (tgz * s + (oz / od) * 0.5) * w;
      }
    }
    if (avoid) {
      const ax = b.x - avoid.x,
        az = b.z - avoid.z,
        ad = Math.hypot(ax, az);
      if (ad < 4.5 && ad > 0.01) {
        const w = avoid.w * (4.5 - ad) / 4.5;
        dx += (ax / ad) * w;
        dz += (az / ad) * w;
      }
    }
    const l = Math.hypot(dx, dz) || 1;
    return { x: dx / l, y: dz / l };
  }

  private cpuThief(i: number, lv: number): CpuPad {
    const t = this.th[i];
    if (!t || t.stun > 0 || this.over) return {};
    const g = this.gd;
    const dg = dist2(t.x, t.z, g.x, g.z);
    const atPile = Math.hypot(t.x, t.z) < GRAB_R - 0.15;
    // decide: load up or run to a van
    if (this.t >= t.think) {
      t.think = this.t + 0.2 + 0.4 * (1 - lv);
      const greedy = t.load < MAX_LOAD && (t.load === 0 || (atPile && dg > 3 + 2 * (1 - lv)));
      if (greedy) {
        // approach the heap on the side away from the guard
        const a = Math.atan2(t.z - g.z * 0.6, t.x - g.x * 0.6);
        t.goalX = Math.cos(a) * (PILE_R + 0.75);
        t.goalZ = Math.sin(a) * (PILE_R + 0.75);
      } else {
        // the van farther from the guard (unless much farther away)
        const dl = dist2(t.x, t.z, -VAN_X, 0) - dist2(g.x, g.z, -VAN_X, 0) * (0.4 + 0.5 * lv);
        const dr = dist2(t.x, t.z, VAN_X, 0) - dist2(g.x, g.z, VAN_X, 0) * (0.4 + 0.5 * lv);
        t.van = dl < dr ? -1 : 1;
        t.goalX = t.van * (VAN_X + 0.3);
        t.goalZ = clamp(t.z * 0.3, -HOLE_Z + 0.8, HOLE_Z - 0.8);
        if (Math.abs(t.x) < VAN_X - 3) t.goalZ = clamp(t.z, -HOLE_Z + 0.6, HOLE_Z - 0.6) * 0.5;
      }
    }
    // dodge the guard only when he's coming (experts read it better), beginners wander a bit
    const gv = Math.hypot(g.vx, g.vz);
    const coming = gv > 0.5 ? ((t.x - g.x) * g.vx + (t.z - g.z) * g.vz) / ((dg || 1) * gv) : 0;
    const fear = (t.load > 0 ? 0.7 + 0.6 * lv : 0.35 + 0.3 * lv) * (coming > 0.5 ? 1.4 : 0.6);
    const s = this.steer(t, t.goalX, t.goalZ, t.safe > 0 ? undefined : { x: g.x, z: g.z, w: fear });
    const wob = (1 - lv) * 0.7;
    s.x += Math.sin(this.t * 2.3 + i * 1.7) * wob;
    s.y += Math.cos(this.t * 1.9 + i * 2.3) * wob;
    const grab = atPile && t.load < MAX_LOAD && this.mashing(i, 5);
    const near = Math.hypot(t.goalX - t.x, t.goalZ - t.z);
    const k = atPile && t.load < MAX_LOAD && dg > 2.5 ? 0.15 : Math.min(1, near / 0.5);
    return { x: s.x * k, y: s.y * k, a: grab };
  }

  private cpuGuard(lv: number): CpuPad {
    const g = this.gd;
    const cands = this.th.map((t, k) => ({ t, k })).filter(({ t }) => t && t.stun <= 0 && t.safe <= 0);
    if (!cands.length || this.over) {
      // guard the heap while everyone is down
      const s = this.steer(g, 0, -2.2);
      const d = Math.hypot(g.x, g.z + 2.2);
      return d > 0.4 ? s : {};
    }
    if (this.t >= this.gThink || !cands.some((c) => c.k === this.gTarget)) {
      this.gThink = this.t + 0.2 + 0.7 * (1 - lv);
      let best = cands[0].k,
        bs = -1e9;
      for (const { t, k } of cands) {
        const d = dist2(g.x, g.z, t.x, t.z);
        // loaded thieves near a van are the priority
        let sc = -d + t.load * (1.5 + 2 * lv) - (Math.abs(t.x) > VAN_X - 4 ? 0 : 0) + Math.random() * (1 - lv) * 4;
        if (k === this.gTarget) sc += 1.5;
        if (sc > bs) {
          bs = sc;
          best = k;
        }
      }
      this.gTarget = best;
    }
    const t = this.th[this.gTarget];
    const d = dist2(g.x, g.z, t.x, t.z);
    const lead = clamp(d / G_SPEED, 0, 0.8) * (0.1 + 0.9 * lv);
    const tx = t.x + t.vx * lead,
      tz = t.z + t.vz * lead;
    const s = this.steer(g, tx, tz);
    const wob = (1 - lv) * 0.6;
    s.x += Math.sin(this.t * 2.1) * wob;
    s.y += Math.cos(this.t * 1.7) * wob;
    let a = false;
    if (g.diveCd <= 0 && d < 2.6 + lv * 0.8 && d > 0.9) {
      // dive when lined up
      const ax = (tx - g.x) / (d || 1),
        az = (tz - g.z) / (d || 1);
      if (ax * s.x + az * s.y > 0.85 && this.cpuAfter(0, "dive", 0.3 - 0.22 * lv)) {
        a = true;
        this.cpuReset(0, "dive");
      }
    }
    return { x: s.x, y: s.y, a };
  }

  // ------------------------------------------------------------ the game

  protected idle(dt: number) {
    this.placeHats();
    this.moveCam([0, 21, 15], [0, 0, 0.8], dt, 1.5);
    this.pile.rotation.y += dt * 0.1;
  }

  start() {
    this.hud.banner(T("THE HEIST BEGINS!", "打劫开始！"), { color: "#ffd23f", sub: T(`${TARGET} ⓩ into the vans`, `把 ${TARGET} 个ⓩ搬上车`), ms: 1400 });
    this.tipEl = this.hud.add(
      `<div style="position:absolute;left:50%;bottom:calc(var(--u)*1.4);transform:translateX(-50%);padding:calc(var(--u)*0.6) calc(var(--u)*1.8);background:rgba(20,14,40,0.75);border-radius:999px;font-size:calc(var(--u)*1.6);font-weight:600;white-space:nowrap">${COIN} ${T("Thieves: <b>A</b> at the heap (3 max) · 👮 Guard: tag them, <b>A</b> = dive", "小偷：在金堆旁按 <b>A</b>（最多 3 个）· 👮 守卫：抓住他们，<b>A</b> = 飞扑")}</div>`,
    );
  }

  protected step(dt: number) {
    const left = TIME - this.t;
    this.hud.timer(left);
    this.placeHats();
    this.moveCam([0, 21, 15], [0, 0, 0.8], dt, 3);
    if (this.t > 7 && this.tipEl) {
      this.tipEl.remove();
      this.tipEl = null;
    }
    if (!this.hurried && left <= 10 && !this.over) {
      this.hurried = true;
      this.hud.banner(T("10 SECONDS LEFT!", "还剩 10 秒！"), { color: "#ff7a5a", size: 6 });
      music.speed(1.15);
      this.sound("bell");
    }
    // alarm lights blink at the end
    const blink = left < 10 ? Math.floor(this.t * 4) % 2 === 0 : false;
    for (const m of this.alarm) m.visible = blink || left >= 10;
    this.glint -= dt;
    if (this.glint <= 0) {
      this.glint = 0.18;
      const a = Math.random() * Math.PI * 2,
        r = Math.random() * PILE_R;
      this.fx.sparkle({ x: Math.cos(a) * r, y: (1 - r / PILE_R) * 1.7 * this.pile.scale.y + 0.2, z: Math.sin(a) * r }, "#fff6a8", 3);
    }
    for (let k = 0; k < 2; k++) {
      this.vanBounce[k] = Math.max(0, this.vanBounce[k] - dt * 3);
      this.vans[k].position.y = Math.sin(this.vanBounce[k] * Math.PI * 3) * 0.12 * this.vanBounce[k];
    }
    this.stepGuard(dt);
    this.stepThieves(dt);
    this.stepFlyers(dt);

    if (this.over) {
      this.over += dt;
      if (this.over > 1.0) this.finishByTeam(this.winner);
      return;
    }
    if (this.banked >= TARGET) {
      this.over = 0.001;
      this.winner = 1;
      this.hud.banner(T("HEIST COMPLETE!", "打劫成功！"), { color: "#ffd23f", size: 8 });
      this.sound("fanfare");
      for (const v of this.vans) this.fx.confetti({ x: v.parent!.position.x, y: 3, z: 0 });
    } else if (left <= 0) {
      this.over = 0.6;
      this.winner = 0;
      this.hud.banner(T("BUSTED! The ⓩ stays shielded", "抓住了！ⓩ仍受屏蔽保护"), { color: "#5fd0ff", size: 7 });
      this.sound("whistle");
    }
  }

  private stepGuard(dt: number) {
    const g = this.gd;
    const a = this.avatars[0];
    const p = this.pad(0);
    g.diveCd -= dt;
    if (g.diveT > 0) {
      g.diveT -= dt;
      a.anim = "jump";
    } else {
      const l = Math.hypot(p.x, p.y);
      const sx = l > 1 ? p.x / l : p.x,
        sz = l > 1 ? p.y / l : p.y;
      const k = 1 - Math.exp(-11 * dt);
      const sp = this.over ? 0 : G_SPEED;
      g.vx += (sx * sp - g.vx) * k;
      g.vz += (sz * sp - g.vz) * k;
      if (p.aDown && g.diveCd <= 0 && !this.over) {
        const yaw = l > 0.2 ? Math.atan2(p.x, p.y) : a.yaw;
        g.vx = Math.sin(yaw) * DIVE_V;
        g.vz = Math.cos(yaw) * DIVE_V;
        g.diveT = DIVE_T;
        g.diveCd = DIVE_CD;
        this.sound("whoosh");
        this.fx.dust(a.pos, 8, "#ffffff");
      }
      const v = Math.hypot(g.vx, g.vz);
      a.anim = v > 0.6 ? "run" : "idle";
      a.speed = clamp(v / G_SPEED, 0, 1);
    }
    g.x += g.vx * dt;
    g.z += g.vz * dt;
    this.solid(g);
    // the guard stays in the vault
    g.x = clamp(g.x, -HX + PR, HX - PR);
    if (Math.hypot(g.vx, g.vz) > 0.5) a.face(Math.atan2(g.vx, g.vz), dt);
    a.pos.set(g.x, 0, g.z);
    // tags
    if (this.over) return;
    this.th.forEach((t, i) => {
      if (!t || t.stun > 0 || t.safe > 0) return;
      if (dist2(t.x, t.z, g.x, g.z) < PR * 2 + 0.15) this.tag(i);
    });
  }

  private tag(i: number) {
    const t = this.th[i];
    const g = this.gd;
    const a = this.avatars[i];
    t.stun = STUN;
    t.safe = STUN + SAFE;
    const dx = t.x - g.x,
      dz = t.z - g.z,
      d = Math.hypot(dx, dz) || 1;
    t.vx = (dx / d) * 7;
    t.vz = (dz / d) * 7;
    g.vx *= 0.2;
    g.vz *= 0.2;
    g.diveT = 0;
    g.tags++;
    this.hud.setScore(this.players[0].seat, this.tagsTxt(g.tags));
    // the coins fly back to the heap
    for (let k = 0; k < t.load; k++) {
      const o = this.coinTpl.clone();
      this.scene.add(o);
      const ang = this.rnd() * Math.PI * 2;
      this.flyCoin(o, { x: t.x, y: 2, z: t.z }, { x: Math.cos(ang) * 0.6, y: 1.2, z: Math.sin(ang) * 0.6 }, 0.6 + k * 0.08, false);
    }
    if (t.load) this.hud.pop(new THREE.Vector3(t.x, 2.6, t.z), `-${t.load}`, "#ff6a5a", this.camera);
    t.load = 0;
    this.setLoad(i);
    a.flash();
    this.sound("whistle");
    this.sound("bonk");
    this.shake = Math.max(this.shake, 0.3);
    this.buzz(i, [100, 50, 100]);
    this.buzz(0, 40);
    this.fx.burst({ x: t.x, y: 1, z: t.z }, { count: 14, colors: ["#ffffff", "#5fd0ff", "#ffd23f"], speed: 5, size: 0.16 });
  }

  private stepThieves(dt: number) {
    this.th.forEach((t, i) => {
      if (!t) return;
      const a = this.avatars[i];
      const p = this.pad(i);
      t.grabCd -= dt;
      t.safe -= dt;
      a.root.visible = t.safe > 0 && t.stun <= 0 ? Math.floor(this.t * 12) % 2 === 0 : true;
      if (t.stun > 0) {
        t.stun -= dt;
        t.vx *= Math.exp(-5 * dt);
        t.vz *= Math.exp(-5 * dt);
        a.anim = "stun";
      } else {
        const l = Math.hypot(p.x, p.y);
        const sx = l > 1 ? p.x / l : p.x,
          sz = l > 1 ? p.y / l : p.y;
        const sp = this.over ? 0 : T_SPEED - LOAD_SLOW * t.load;
        const k = 1 - Math.exp(-12 * dt);
        t.vx += (sx * sp - t.vx) * k;
        t.vz += (sz * sp - t.vz) * k;
        const v = Math.hypot(t.vx, t.vz);
        a.anim = v > 0.6 ? "run" : t.load ? "hold" : "idle";
        a.speed = clamp(v / T_SPEED, 0, 1);
        // grab a coin at the heap
        const atPile = Math.hypot(t.x, t.z) < GRAB_R;
        if (atPile && p.a && t.grabCd <= 0 && t.load < MAX_LOAD && !this.over) {
          t.load++;
          t.grabCd = GRAB_CD;
          this.setLoad(i);
          this.sound("coin");
          this.fx.sparkle({ x: t.x, y: 1.6, z: t.z }, "#ffe14a", 8);
          if (t.load === MAX_LOAD) this.hud.pop(new THREE.Vector3(t.x, 2.8, t.z), T("Full!", "满了！"), "#ffe14a", this.camera);
        }
      }
      t.x += t.vx * dt;
      t.z += t.vz * dt;
      this.solid(t);
      if (Math.hypot(t.vx, t.vz) > 0.5 && t.stun <= 0) a.face(Math.atan2(t.vx, t.vz), dt);
      a.pos.set(t.x, 0, t.z);
      // the carried coins bob above the head
      t.coins.forEach((c, k) => {
        c.position.set(t.x, 1.75 + k * 0.2 + Math.sin(this.t * 6 + k) * 0.03, t.z);
        c.rotation.set(Math.PI / 2, 0, this.t * 2 + k);
      });
      // into the van!
      if (t.load > 0 && Math.abs(t.x) > VAN_X - 1.4 && Math.abs(t.z) < HOLE_Z && !this.over) {
        const side = t.x < 0 ? 0 : 1;
        for (let k = 0; k < t.load; k++) {
          const o = this.coinTpl.clone();
          this.scene.add(o);
          this.flyCoin(o, { x: t.x, y: 1.8 + k * 0.2, z: t.z }, { x: (side ? 1 : -1) * (HX + 3.6), y: 1.6, z: (k - 1) * 0.6 }, 0.35 + k * 0.08, true);
        }
        this.banked += t.load;
        t.banked += t.load;
        this.hud.setScore(this.players[i].seat, `${COIN} ${t.banked}`);
        this.hud.pop(new THREE.Vector3(t.x, 2.8, t.z), `+${t.load}`, "#ffe14a", this.camera);
        this.vanBounce[side] = 1;
        this.sound("cash");
        this.buzz(i, 40);
        t.load = 0;
        this.setLoad(i);
        this.updateBar();
        if (!this.over && TARGET - this.banked <= 4 && TARGET - this.banked > 0) this.hud.banner(T(`${TARGET - this.banked} TO GO!`, `还差 ${TARGET - this.banked} 个！`), { color: "#ffd23f", size: 6, ms: 900 });
      }
    });
    // thieves bump each other
    const all = this.th.filter(Boolean);
    for (let m = 0; m < all.length; m++)
      for (let n = m + 1; n < all.length; n++) {
        const A = all[m],
          B = all[n];
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

  private stepFlyers(dt: number) {
    for (const f of this.flyers) {
      f.t += dt;
      const k = clamp(f.t / f.dur, 0, 1);
      f.o.position.set(f.x0 + (f.x1 - f.x0) * k, f.y0 + (f.y1 - f.y0) * k + Math.sin(k * Math.PI) * 2.2, f.z0 + (f.z1 - f.z0) * k);
      f.o.rotation.set(k * 9, k * 5, 0);
      if (k >= 1) {
        f.o.removeFromParent();
        if (f.toVan) this.fx.sparkle(f.o.position, "#ffe14a", 6);
      }
    }
    this.flyers = this.flyers.filter((f) => f.t < f.dur);
  }

  /** Balance stats (headless tests). */
  simInfo() {
    return { banked: this.banked, tags: this.gd.tags, t: Math.round(this.t) };
  }

  protected outroStep(dt: number) {
    this.placeHats();
    this.stepFlyers(dt);
    this.pile.rotation.y += dt * 0.1;
    if (this.winner === 1) this.moveCam([0, 12, 12], [0, 0.8, 1], dt, 2);
    else this.moveCam([this.gd.x * 0.6, 9, this.gd.z + 9], [this.gd.x, 1, this.gd.z], dt, 2);
  }
}

const def: MiniDef = {
  id: "coffre-fort",
  name: "Shielded Vault",
  icon: "💰",
  color: "#d4a017",
  tagline: "Three thieves, one guard, a vault full of ⓩ.",
  rules: `Thieves: run in, grab the ⓩ (A, 3 at most) and carry it out to the vans: ${TARGET} in 40 s! Guard: tag them to make them drop it all, A to dive.`,
  controls: { stick: "Run", a: "Grab ⓩ / Dive (guard)" },
  modes: ["1v3"],
  length: 40,
  music: "tense",
  create: (ctx) => new CoffreFort(ctx),
};
export default def;
