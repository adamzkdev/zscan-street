/**
 * BUCKET BATTLE (2 vs 2, 45 s): a village square with a well in the middle; each team has a
 * wooden tub on its side. Hold A at the well (~1 s) to fill your bucket, carry it (slower) to your
 * tub and press A to pour. B = splash forward: it empties your bucket, and a rival caught in the
 * splash is stunned and spills theirs. The team with the fuller tub wins (a draw is possible).
 */
import * as THREE from "three";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef } from "../types";
import { GEO, ball, box, canvasTex, cone, cyl, flat, group, toon, tree } from "../../engine/gfx";
import { clamp, dist2 } from "../../engine/util";
import { music } from "../../engine/audio";
import { T } from "../../../../i18n/lang";

const TIME = 45;
const HX = 8.8;
const HZ = 5.6;
const PR = 0.42;
const WELL_R = 1.15;
/** The two spouts of the well (north and south): stand at one to fill. */
const SPOUTS: [number, number][] = [
  [0, -(WELL_R + 0.75)],
  [0, WELL_R + 0.75],
];
const SPOUT_R = 0.85;
const FILL_T = 1.0;
const TUB_X = 7.4;
const TUB_R = 1.25;
const POUR_R = TUB_R + 1.0;
const POUR_T = 0.35;
const SPEED = 5.8;
const SPEED_FULL = 4.3;
const SPLASH_RANGE = 3.2;
const SPLASH_COS = 0.72;
const STUN = 1.3;
const TUB_VIS = 150; // the tub looks full at this many litres
const BUCKET_L = 10; // litres in a full bucket
const SLOSH = 0.07; // share of the bucket lost per second of running
const MIN_AMT = 0.6;
const TEAM_COL = ["#ff5a4e", "#3d8bff"];

interface P {
  x: number;
  z: number;
  vx: number;
  vz: number;
  full: boolean;
  /** How full the bucket still is (water sloshes out while running). */
  amt: number;
  fill: number;
  pour: number;
  stun: number;
  throwT: number;
  pours: number;
  team: number;
  bucket: THREE.Group;
  water: THREE.Mesh;
  bar: THREE.Group;
  barFill: THREE.Mesh;
  /** CPU */
  think: number;
  plan: "fill" | "pour" | "attack";
  foe: number;
  spout: number;
  pace: number;
}

class BatailleEau extends BaseMini {
  private ps: P[] = [];
  private tubs: { x: number; level: number; water: THREE.Mesh; label: HTMLElement; anchor: THREE.Object3D }[] = [];
  private score!: HTMLElement;
  private hurried = false;
  private crank!: THREE.Group;
  private flags: THREE.Mesh[] = [];
  private over = 0;
  private tipEl: HTMLElement | null = null;
  private drips: THREE.Vector3[] = [];
  private marks: THREE.Object3D[] = [];
  private dripT = 0;

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#64b8ff", "#fff3dc"], size: 18, sun: [0.4, 1, 0.55], fog: { near: 55, far: 120 } });
    this.buildSquare();
    const starts = [
      [-5, -2.2],
      [-5, 2.2],
      [5, -2.2],
      [5, 2.2],
    ];
    this.players.forEach((pl, i) => {
      const [x, z] = starts[i];
      const a = this.spawn(i, x, z, x < 0 ? Math.PI / 2 : -Math.PI / 2);
      a.setRing(pl.char.color);
      // the bucket, carried at the side
      const bucket = group(this.scene);
      const pail = cyl(bucket, "#b07a44", 0.24, 0.4, { y: 0.2, rTop: 0.3, seg: 12 });
      pail.castShadow = true;
      for (const y of [0.07, 0.33]) {
        const hoop = new THREE.Mesh(GEO.torus, toon("#6a6a78"));
        hoop.scale.set(0.25 + y * 0.15, 0.25 + y * 0.15, 0.12);
        hoop.rotation.x = Math.PI / 2;
        hoop.position.y = y;
        bucket.add(hoop);
      }
      const handle = new THREE.Mesh(GEO.torus, toon("#4a4a56"));
      handle.scale.set(0.28, 0.3, 0.1);
      handle.position.y = 0.4;
      bucket.add(handle);
      const water = new THREE.Mesh(GEO.circle, toon("#5fc8ff", "#1a7ac0", 0.5));
      water.rotation.x = -Math.PI / 2;
      water.scale.setScalar(0.27);
      water.position.y = 0.36;
      bucket.add(water);
      // the fill bar over the head
      const bar = group(this.scene);
      box(bar, flat("#1d1630"), 1.1, 0.2, 0.05, { cast: false });
      const barFill = box(bar, flat("#5fd0ff"), 1.0, 0.13, 0.06, { cast: false });
      bar.visible = false;
      this.ps.push({ x, z, vx: 0, vz: 0, full: false, amt: 0, fill: 0, pour: 0, stun: 0, throwT: 0, pours: 0, team: pl.team, bucket, water, bar, barFill, think: 0, plan: "fill", foe: -1, spout: z < 0 ? 0 : 1, pace: 1 });
    });
    this.hud.players(this.players, () => "💧 0 L", { teams: true });
    this.hud.timer(TIME);
    this.score = this.hud.add(
      `<div style="position:absolute;left:50%;top:calc(var(--u)*7.6);transform:translateX(-50%);display:flex;gap:calc(var(--u)*1);align-items:center;font-family:var(--title);font-size:calc(var(--u)*3.4);-webkit-text-stroke:calc(var(--u)*0.2) #1d1630;paint-order:stroke fill">
        <span class="a" style="min-width:calc(var(--u)*6);text-align:center;padding:0 calc(var(--u)*1);border-radius:999px;background:${TEAM_COL[0]};color:#fff;border:calc(var(--u)*0.3) solid #1d1630">0 L</span>
        <span style="color:#fff;font-size:calc(var(--u)*2.4)">🪣</span>
        <span class="b" style="min-width:calc(var(--u)*6);text-align:center;padding:0 calc(var(--u)*1);border-radius:999px;background:${TEAM_COL[1]};color:#fff;border:calc(var(--u)*0.3) solid #1d1630">0 L</span>
      </div>`,
    );
    this.setCam([0, 30, 25], [0, 0, 0.5], 42);
  }

  // ------------------------------------------------------------ the village square

  private buildSquare() {
    const s = this.scene;
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), toon("#8ccf63"));
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.03;
    grass.receiveShadow = true;
    s.add(grass);
    // cobbles
    const tex = canvasTex(1024, 640, (g, w, h) => {
      g.fillStyle = "#c2b294";
      g.fillRect(0, 0, w, h);
      for (let k = 0; k < 1400; k++) {
        const x = (k * 263) % w,
          y = (k * 151 + Math.floor(k / 7) * 13) % h;
        g.fillStyle = ["#d8c8a6", "#cdbd9b", "#e2d4b4", "#c9b893"][k % 4];
        g.beginPath();
        g.ellipse(x, y, 14 + (k % 3) * 3, 10 + (k % 2) * 3, (k % 5) * 0.6, 0, Math.PI * 2);
        g.fill();
      }
      // wet stones under the two spouts
      g.fillStyle = "rgba(70,110,150,0.45)";
      for (const [, sz] of SPOUTS) {
        g.beginPath();
        g.ellipse(w / 2, h / 2 + (sz / (2 * HZ + 2)) * h, (SPOUT_R / (2 * HX + 2)) * w * 1.3, (SPOUT_R / (2 * HZ + 2)) * h * 1.3, 0, 0, Math.PI * 2);
        g.fill();
      }
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * HX + 2, 2 * HZ + 2), new THREE.MeshToonMaterial({ map: tex }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);
    // team zones painted around the tubs
    for (const sx of [-1, 1]) {
      const z = new THREE.Mesh(new THREE.CircleGeometry(POUR_R + 0.3, 32), flat(TEAM_COL[sx < 0 ? 0 : 1], 0.28));
      z.rotation.x = -Math.PI / 2;
      z.position.set(sx * TUB_X, 0.02, 0);
      s.add(z);
    }
    // a low stone curb
    for (const sz of [-1, 1]) box(s, "#a89a80", 2 * HX + 2.4, 0.35, 0.5, { y: 0.17, z: sz * (HZ + 1.2) });
    for (const sx of [-1, 1]) box(s, "#a89a80", 0.5, 0.35, 2 * HZ + 2.9, { x: sx * (HX + 1.2), y: 0.17 });

    // the well
    const w = group(s);
    cyl(w, "#b8b0a0", WELL_R, 0.9, { y: 0.45, seg: 20 });
    cyl(w, "#d0c8b6", WELL_R + 0.1, 0.16, { y: 0.92, seg: 20 });
    const wt = new THREE.Mesh(GEO.circle, toon("#2a7ac0", "#0a3a70", 0.5));
    wt.rotation.x = -Math.PI / 2;
    wt.scale.setScalar(WELL_R - 0.15);
    wt.position.y = 0.7;
    w.add(wt);
    for (const sx of [-1, 1]) box(w, "#7a4e2c", 0.18, 2.2, 0.18, { x: sx * (WELL_R - 0.05), y: 1.9 });
    const roof = group(w, { y: 3.1 });
    for (const sx of [-1, 1]) box(roof, "#c8503c", 1.9, 0.12, 2.8, { x: sx * 0.62, y: 0, rz: -sx * 0.6 });
    this.crank = group(w, { y: 2.3 });
    cyl(this.crank, "#6a4a32", 0.15, 2.0, { rz: Math.PI / 2, seg: 10 });
    box(this.crank, "#4a3424", 0.08, 0.45, 0.08, { x: WELL_R + 0.1, y: -0.2 });
    cyl(w, "#c8c0b0", 0.03, 0.9, { y: 1.85, seg: 4 });
    for (const [, sz] of SPOUTS) {
      const sp = group(w, { z: Math.sign(sz) * (WELL_R + 0.05) });
      box(sp, "#6a6a78", 0.22, 0.22, 0.6, { y: 0.75, z: Math.sign(sz) * 0.2 });
      box(sp, "#7a4e2c", 0.9, 0.3, 0.6, { y: 0.15, z: Math.sign(sz) * 0.45 });
      const pud = new THREE.Mesh(GEO.circle, toon("#5fc8ff", "#1a7ac0", 0.4));
      pud.rotation.x = -Math.PI / 2;
      pud.scale.set(0.38, 0.22, 1);
      pud.position.set(0, 0.31, Math.sign(sz) * 0.45);
      sp.add(pud);
      // a trickle of water from the pipe into the trough
      const stream = cyl(sp, toon("#7fd6ff", "#2a8ad0", 0.6), 0.06, 0.45, { y: 0.52, z: Math.sign(sz) * 0.48, seg: 8 });
      stream.castShadow = false;
      // a big floating drop marks the spot
      const mark = ball(sp, toon("#5fc8ff", "#1a7ac0", 0.5), [0.2, 0.26, 0.2], { y: 2.0, z: Math.sign(sz) * 0.6, cast: false });
      this.marks.push(mark);
      this.drips.push(new THREE.Vector3(0, 0.6, sz * 0.86));
    }
    cyl(w, "#b07a44", 0.2, 0.3, { y: 1.3, rTop: 0.25, seg: 10 });

    // the tubs
    for (const [k, sx] of [-1, 1].entries()) {
      const g = group(s, { x: sx * TUB_X });
      // an open wooden tub (we see the water inside)
      const body = new THREE.Mesh(new THREE.CylinderGeometry(TUB_R + 0.12, TUB_R, 1.2, 22, 1, true), new THREE.MeshToonMaterial({ color: "#b07a44", side: THREE.DoubleSide }));
      body.position.y = 0.6;
      body.castShadow = true;
      body.receiveShadow = true;
      g.add(body);
      const rim = new THREE.Mesh(GEO.torus, toon("#8a5a2e"));
      rim.scale.set(TUB_R + 0.12, TUB_R + 0.12, 0.3);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 1.2;
      g.add(rim);
      for (const y of [0.2, 1.0]) {
        const hoop = new THREE.Mesh(GEO.torus, toon("#5a5a68"));
        hoop.scale.set(TUB_R + 0.04 + y * 0.1, TUB_R + 0.04 + y * 0.1, 0.25);
        hoop.rotation.x = Math.PI / 2;
        hoop.position.y = y;
        g.add(hoop);
      }
      // the bottom, and the water that rises
      const inside = new THREE.Mesh(GEO.circle, toon("#6a4424"));
      inside.rotation.x = -Math.PI / 2;
      inside.scale.setScalar(TUB_R - 0.02);
      inside.position.y = 0.06;
      g.add(inside);
      const water = new THREE.Mesh(new THREE.CylinderGeometry(TUB_R + 0.08, TUB_R - 0.02, 1, 22), toon("#5fc8ff", "#1a7ac0", 0.5));
      water.position.y = 0.12;
      water.scale.y = 0.02;
      g.add(water);
      // a team flag
      cyl(g, "#6a4a32", 0.05, 2.8, { x: sx * (TUB_R + 0.25), y: 1.4, z: -0.9, seg: 6 });
      const f = box(g, flat(TEAM_COL[k]), 0.9, 0.6, 0.04, { x: sx * (TUB_R + 0.25) - sx * 0.45, y: 2.5, z: -0.9, cast: false });
      this.flags.push(f);
      const anchor = group(g, { y: 1.3 });
      const label = this.hud.label(anchor, "0 L", { dy: 1.4, cls: "big", color: TEAM_COL[k] });
      this.tubs.push({ x: sx * TUB_X, level: 0, water, label, anchor });
    }

    // the village: houses around
    const walls = ["#f6d7a8", "#ffd1d1", "#cde8ff", "#fff1b8", "#d8f0c8", "#f0d0f0"];
    const roofs = ["#c8503c", "#7a5a9a", "#3a6ab0", "#c87a3c"];
    for (let k = 0; k < 9; k++) {
      const x = -17 + k * 4.25;
      const h = 4 + (k % 3) * 1.2;
      const g = group(s, { x, z: -HZ - 5 });
      box(g, walls[k % walls.length], 4, h, 3.4, { y: h / 2 });
      for (const sz of [-1, 1]) box(g, roofs[k % roofs.length], 4.4, 0.16, 2.3, { y: h + 0.62, z: sz * 0.86, rx: sz * 0.62 });
      box(g, walls[k % walls.length], 3.9, 1.0, 0.1, { y: h + 0.4, z: 0, cast: false });
      box(g, "#8a5a3a", 0.5, 1.2, 0.5, { x: 1.2, y: h + 1.2, z: -0.6 });
      for (const fx of [-1, 1]) {
        box(g, "#6ab0e8", 0.8, 0.9, 0.1, { x: fx * 1.0, y: h - 1.2, z: 1.72, cast: false });
        box(g, "#3a8a3a", 0.9, 0.25, 0.3, { x: fx * 1.0, y: h - 1.8, z: 1.82, cast: false });
        for (let q = 0; q < 3; q++) ball(g, ["#ff5a7a", "#ffd23f", "#ffffff"][q], 0.1, { x: fx * 1.0 - 0.3 + q * 0.3, y: h - 1.6, z: 1.9, lo: true, cast: false });
      }
      box(g, "#7a4e2c", 0.9, 1.7, 0.1, { y: 0.85, z: 1.72, cast: false });
    }
    // bunting across the square
    const cols = ["#ff4b3e", "#ffd23f", "#3fcf5a", "#2f8dff", "#ff7ad9"];
    for (const z of [-HZ - 2.5]) {
      for (let k = 0; k < 26; k++) {
        const t = k / 25;
        const x = -HX - 1 + t * (2 * HX + 2);
        const y = 4.2 - Math.sin(t * Math.PI) * 1.0;
        const m = cone(s, cols[k % cols.length], 0.25, 0.45, { x, y, z, rx: Math.PI });
        m.castShadow = false;
      }
    }
    for (let k = 0; k < 6; k++) {
      tree(s, -HX - 4.5, -5 + k * 2.6, 1.4 + (k % 2) * 0.3, k % 2 ? "#5cc44f" : "#48b04a");
      tree(s, HX + 4.5, -5 + k * 2.6, 1.4 + ((k + 1) % 2) * 0.3, k % 2 ? "#48b04a" : "#5cc44f");
    }
    // benches and lamps in front
    for (const x of [-6, 6]) {
      box(s, "#c0843e", 2.6, 0.15, 0.6, { x, y: 0.5, z: HZ + 2.4 });
      box(s, "#c0843e", 2.6, 0.5, 0.1, { x, y: 0.85, z: HZ + 2.7 });
    }
    for (const x of [-HX - 1.6, HX + 1.6])
      for (const z of [-HZ - 1.4, HZ + 1.6]) {
        cyl(s, "#2d3a4a", 0.08, 3, { x, y: 1.5, z, seg: 8 });
        ball(s, toon("#fff3b0", "#ffcc33", 0.9), 0.25, { x, y: 3.1, z });
      }
  }

  // ------------------------------------------------------------ helpers

  private collide(p: P) {
    for (const [x, z, r] of [
      [0, 0, WELL_R],
      [-TUB_X, 0, TUB_R],
      [TUB_X, 0, TUB_R],
    ]) {
      const dx = p.x - x,
        dz = p.z - z,
        d = Math.hypot(dx, dz);
      if (d < r + PR) {
        p.x = x + (dx / (d || 1)) * (r + PR);
        p.z = z + (dz / (d || 1)) * (r + PR);
      }
    }
    p.x = clamp(p.x, -HX + PR, HX - PR);
    p.z = clamp(p.z, -HZ + PR, HZ - PR);
  }

  private setScores() {
    const [a, b] = this.tubs.map((t) => t.level);
    (this.score.querySelector(".a") as HTMLElement).textContent = `${a} L`;
    (this.score.querySelector(".b") as HTMLElement).textContent = `${b} L`;
    this.tubs.forEach((t) => (t.label.innerHTML = `${t.level} L`));
  }

  // ------------------------------------------------------------ CPUs

  protected cpu(i: number, _dt: number): CpuPad {
    const me = this.ps[i];
    const lv = this.players[i].level;
    if (me.stun > 0 || this.over) return {};
    const myTub = this.tubs[me.team];
    if (this.t >= me.think) {
      me.think = this.t + 0.15 + 0.4 * (1 - lv) + Math.random() * 0.2;
      me.pace = Math.min(1, 0.8 + 0.15 * lv + Math.random() * 0.12);
      me.plan = me.full ? "pour" : "fill";
      me.foe = -1;
      if (me.full) {
        // splash a rival worth it: loaded and closer to scoring than me, or blocking my spout
        const myD = dist2(me.x, me.z, myTub.x, 0);
        let best = 1e9;
        for (let j = 0; j < this.ps.length; j++) {
          const o = this.ps[j];
          if (o.team === me.team || o.stun > 0) continue;
          const d = dist2(me.x, me.z, o.x, o.z);
          const theirD = dist2(o.x, o.z, this.tubs[o.team].x, 0);
          const worth = (o.full && theirD < myD + 1.5) || (o.fill > FILL_T * 0.5 && myD < 3);
          if (worth && d < 3.6 + lv && d < best && this.cpuChance(i, 0.3, 0.9)) {
            best = d;
            me.plan = "attack";
            me.foe = j;
          }
        }
      } else {
        // the spout with the fewest people around (and close)
        let bs = 1e9;
        SPOUTS.forEach(([sx, sz], k) => {
          let sc = dist2(me.x, me.z, sx, sz);
          for (const o of this.ps) if (o !== me && dist2(o.x, o.z, sx, sz) < 1.2) sc += o.team === me.team ? 4 : 2.5;
          if (sc < bs) {
            bs = sc;
            me.spout = k;
          }
        });
      }
    }
    let tx = 0,
      tz = 0,
      a = false,
      b = false;
    if (me.plan === "fill") {
      const [sx, sz] = SPOUTS[me.spout];
      tx = sx;
      tz = sz + Math.sign(sz) * 0.2;
      if (dist2(me.x, me.z, sx, sz) < SPOUT_R - 0.15) {
        a = true;
        tx = me.x;
        tz = me.z;
      }
    } else if (me.plan === "pour") {
      const ang = Math.atan2(me.z, me.x - myTub.x);
      tx = myTub.x + Math.cos(ang) * (TUB_R + 0.6);
      tz = Math.sin(ang) * (TUB_R + 0.6);
      if (dist2(me.x, me.z, myTub.x, 0) < POUR_R - 0.15) a = this.cpuAfter(i, "pour", 0.25 - 0.2 * lv);
      else this.cpuReset(i, "pour");
    } else {
      const o = this.ps[me.foe];
      if (!o || (!o.full && o.fill <= 0) || o.stun > 0 || !me.full) {
        me.plan = "pour";
        return {};
      }
      tx = o.x + o.vx * 0.25;
      tz = o.z + o.vz * 0.25;
      const d = dist2(me.x, me.z, o.x, o.z);
      const yaw = this.avatars[i].yaw;
      const facing = (Math.sin(yaw) * (o.x - me.x) + Math.cos(yaw) * (o.z - me.z)) / (d || 1);
      if (d < SPLASH_RANGE - 0.5 && facing > SPLASH_COS + 0.08) b = this.cpuAfter(i, "splash", 0.3 - 0.25 * lv);
      else this.cpuReset(i, "splash");
    }
    // walk there, around the well
    let dx = tx - me.x,
      dz = tz - me.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.15) return { a, b };
    dx /= d;
    dz /= d;
    const wd = Math.hypot(me.x, me.z);
    if (wd < WELL_R + 1.2 && !(me.plan === "fill" && dist2(me.x, me.z, tx, tz) < 1.5)) {
      const tg = me.z * dx - me.x * dz > 0 ? 1 : -1;
      dx += (-me.z / wd) * tg * -0.8 + (me.x / wd) * 0.4;
      dz += (me.x / wd) * tg * -0.8 + (me.z / wd) * 0.4;
    }
    const k = Math.min(1, d / 0.5) * me.pace;
    const l = Math.hypot(dx, dz) || 1;
    return { x: (dx / l) * k, y: (dz / l) * k, a, b };
  }

  // ------------------------------------------------------------ the game

  protected idle(dt: number) {
    this.moveCam(CAM_POS, CAM_LOOK, dt, 1.5);
    this.decor(dt);
    this.placeBuckets();
  }

  start() {
    this.hud.banner(T("BUCKETS UP!", "拿起水桶！"), { color: "#5fd0ff", ms: 1200 });
    this.tipEl = this.hud.add(
      `<div style="position:absolute;left:50%;bottom:calc(var(--u)*1.4);transform:translateX(-50%);padding:calc(var(--u)*0.6) calc(var(--u)*1.8);background:rgba(20,14,40,0.75);border-radius:999px;font-size:calc(var(--u)*1.6);font-weight:600;white-space:nowrap">${T("Hold <b>A</b> at the well · <b>A</b> by your tub to pour · <b>B</b> splashes a rival", "在井边按住 <b>A</b> 装水 · 在水槽旁按 <b>A</b> 倒水 · <b>B</b> 泼对手")}</div>`,
    );
  }

  private decor(dt: number) {
    this.marks.forEach((m, k) => {
      m.position.y = 2.0 + Math.sin(this.t * 3 + k) * 0.15;
      m.rotation.y += dt * 2;
    });
    this.dripT -= dt;
    if (this.dripT <= 0) {
      this.dripT = 0.25;
      for (const d of this.drips) this.fx.burst(d, { count: 1, colors: ["#9fe0ff"], speed: 0.3, up: 0, gravity: 9, size: 0.08, life: 0.35, shape: "ball" });
    }
    this.crank.rotation.x += dt * (this.ps.some((p) => p.fill > 0) ? 6 : 0.3);
    this.flags.forEach((f, k) => (f.rotation.y = Math.sin(this.t * 3 + k) * 0.25));
  }

  private placeBuckets() {
    this.ps.forEach((p, i) => {
      const a = this.avatars[i];
      const yaw = a.yaw;
      const pouring = p.pour > 0;
      const side = 0.5;
      // at the right hand (or held up while pouring / throwing)
      const fx = Math.sin(yaw),
        fz = Math.cos(yaw);
      const rx = Math.cos(yaw),
        rz = -Math.sin(yaw);
      const up = pouring || p.throwT > 0 ? 1.0 : 0;
      const fwd = pouring || p.throwT > 0 ? 0.6 : 0.1;
      p.bucket.position.set(a.pos.x - rx * side * (up ? 0 : 1) + fx * fwd, a.pos.y + 0.3 + up * 0.7, a.pos.z - rz * side * (up ? 0 : 1) + fz * fwd);
      p.bucket.rotation.set(0, yaw, 0);
      if (pouring || p.throwT > 0) p.bucket.rotateX(1.6);
      p.water.visible = p.full;
      p.water.position.y = 0.14 + 0.22 * p.amt;
      p.bar.visible = p.fill > 0 && !p.full;
      p.bar.position.set(a.pos.x, 2.3, a.pos.z);
      p.barFill.scale.x = Math.max(0.01, p.fill / FILL_T);
      p.barFill.position.x = -0.5 + 0.5 * (p.fill / FILL_T);
    });
  }

  protected step(dt: number) {
    const left = TIME - this.t;
    this.hud.timer(left);
    this.moveCam(CAM_POS, CAM_LOOK, dt, 3);
    this.decor(dt);
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
    this.ps.forEach((p, i) => this.stepPlayer(p, i, dt));
    // bumps
    for (let m = 0; m < this.ps.length; m++)
      for (let n = m + 1; n < this.ps.length; n++) {
        const A = this.ps[m],
          B = this.ps[n];
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
    this.placeBuckets();
    // the water in the tubs
    for (const t of this.tubs) {
      const target = 0.04 + 1.0 * clamp(t.level / TUB_VIS, 0, 1);
      t.water.scale.y += (target - t.water.scale.y) * (1 - Math.exp(-6 * dt));
      t.water.position.y = 0.1 + t.water.scale.y / 2;
    }
    if (left <= 0 && !this.over) {
      this.over = 1;
      const [a, b] = this.tubs.map((t) => t.level);
      this.finishByTeam(a === b ? null : a > b ? 0 : 1);
    }
  }

  private stepPlayer(p: P, i: number, dt: number) {
    const a = this.avatars[i];
    const pad = this.pad(i);
    p.pour -= dt;
    p.throwT -= dt;
    if (p.stun > 0) {
      p.stun -= dt;
      p.vx *= Math.exp(-5 * dt);
      p.vz *= Math.exp(-5 * dt);
      p.fill = 0;
      a.anim = "stun";
    } else if (p.pour > 0) {
      p.vx = p.vz = 0;
      a.anim = "throw";
    } else {
      const l = Math.hypot(pad.x, pad.y);
      const sx = l > 1 ? pad.x / l : pad.x,
        sz = l > 1 ? pad.y / l : pad.y;
      const atWell = SPOUTS.some(([sx, sz]) => dist2(p.x, p.z, sx, sz) < SPOUT_R);
      const filling = atWell && pad.a && !p.full;
      const sp = filling ? 0 : p.full ? SPEED_FULL : SPEED;
      const k = 1 - Math.exp(-12 * dt);
      p.vx += (sx * sp - p.vx) * k;
      p.vz += (sz * sp - p.vz) * k;
      // fill at the well
      if (filling) {
        p.fill += dt;
        a.anim = "push";
        a.speed = 0.6;
        a.faceTo(0, Math.sign(p.z || 1) * WELL_R, dt);
        if (Math.random() < 0.5) this.fx.burst({ x: 0, y: 0.75, z: Math.sign(p.z || 1) * (WELL_R + 0.45) }, { count: 2, colors: ["#bfe8ff", "#5fc8ff"], speed: 1.2, up: 0.5, gravity: 10, size: 0.1, life: 0.4, shape: "ball" });
        if (p.fill >= FILL_T) {
          p.full = true;
          p.amt = 1;
          p.fill = 0;
          this.sound("splash");
          this.fx.sparkle({ x: p.x, y: 1.2, z: p.z }, "#bfe8ff", 10);
          this.buzz(i, 30);
        }
      } else {
        if (!pad.a) p.fill = 0;
        const v = Math.hypot(p.vx, p.vz);
        if (p.full && v > 1) {
          p.amt = Math.max(MIN_AMT, p.amt - SLOSH * dt * (v / SPEED_FULL));
          if (Math.random() < dt * 6) this.fx.burst({ x: p.bucket.position.x, y: 0.7, z: p.bucket.position.z }, { count: 1, colors: ["#9fe0ff"], speed: 0.8, up: 1, gravity: 10, size: 0.08, life: 0.35, shape: "ball" });
        }
        a.anim = v > 0.6 ? "run" : "idle";
        a.speed = clamp(v / SPEED, 0, 1);
      }
      // pour into my tub
      const tub = this.tubs[p.team];
      if (pad.aDown && p.full && dist2(p.x, p.z, tub.x, 0) < POUR_R && !this.over) {
        const litres = Math.round(p.amt * BUCKET_L);
        p.full = false;
        p.pour = POUR_T;
        p.pours += litres;
        tub.level += litres;
        a.faceTo(tub.x, 0, 1);
        this.setScores();
        this.hud.setScore(this.players[i].seat, `💧 ${p.pours} L`);
        this.hud.pop(new THREE.Vector3(tub.x, 2.6, 0), `+${litres} L`, TEAM_COL[p.team], this.camera);
        this.sound("splash");
        this.sound("coin");
        this.fx.splash({ x: tub.x, y: 1.25, z: 0 }, "#9fe0ff");
        this.buzz(i, 40);
      }
      // splash!
      if (pad.bDown && !this.over) {
        if (p.full) this.splash(p, i, l > 0.3 ? Math.atan2(pad.x, pad.y) : a.yaw);
        else this.sound("click");
      }
    }
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    this.collide(p);
    if (Math.hypot(p.vx, p.vz) > 0.5 && p.stun <= 0 && p.pour <= 0) a.face(Math.atan2(p.vx, p.vz), dt);
    a.pos.set(p.x, 0, p.z);
  }

  private splash(p: P, i: number, yaw: number) {
    const a = this.avatars[i];
    a.yaw = yaw;
    p.full = false;
    p.throwT = 0.3;
    const fx = Math.sin(yaw),
      fz = Math.cos(yaw);
    this.sound("whoosh");
    this.sound("splash");
    // a sheet of water flying forward
    for (let k = 0; k < 4; k++) this.fx.burst({ x: p.x + fx * (0.6 + k * 0.6), y: 1.1, z: p.z + fz * (0.6 + k * 0.6) }, { count: 8, colors: ["#9fe0ff", "#ffffff", "#5fc8ff"], speed: 2.5, up: 3, gravity: 12, size: 0.16, sizeEnd: 0.05, life: 0.55, shape: "ball", drag: 0.5 });
    let hit = false;
    this.ps.forEach((o, j) => {
      if (o.team === p.team || o.stun > 0) return;
      const dx = o.x - p.x,
        dz = o.z - p.z,
        d = Math.hypot(dx, dz);
      if (d > SPLASH_RANGE || d < 0.01) return;
      if ((dx * fx + dz * fz) / d < SPLASH_COS) return;
      hit = true;
      o.stun = STUN;
      o.fill = 0;
      o.vx = (dx / d) * 6;
      o.vz = (dz / d) * 6;
      const spilled = o.full;
      o.full = false;
      this.avatars[j].flash();
      this.fx.splash({ x: o.x, y: 0.6, z: o.z });
      this.hud.pop(new THREE.Vector3(o.x, 2.4, o.z), spilled ? T("Spilled!", "打翻了！") : T("Splash!", "泼中！"), "#5fd0ff", this.camera);
      this.buzz(j, [80, 40, 80]);
    });
    if (hit) {
      this.sound("bonk");
      this.shake = Math.max(this.shake, 0.25);
    }
  }

  /** Balance stats (headless tests). */
  simInfo() {
    return { a: this.tubs[0].level, b: this.tubs[1].level };
  }

  protected outroStep(dt: number) {
    this.decor(dt);
    this.placeBuckets();
    const [a, b] = this.tubs.map((t) => t.level);
    const x = a === b ? 0 : a > b ? -TUB_X : TUB_X;
    this.moveCam([x * 0.7, 9, 10], [x * 0.85, 1, 0], dt, 2);
  }
}

const CAM_POS: [number, number, number] = [0, 17, 13.2];
const CAM_LOOK: [number, number, number] = [0, 0, 0.7];

const def: MiniDef = {
  id: "bataille-eau",
  name: "Bucket Battle",
  icon: "🪣",
  color: "#4ab0ff",
  tagline: "Fill your team's tub faster than the others.",
  rules: "Hold A at a tap to fill your bucket, then A by your tub to empty it (don't run too much: it spills!). B sprays: a soaked rival drops their bucket. The fuller tub wins!",
  controls: { stick: "Run", a: "Fill (hold) / Pour", b: "Splash" },
  modes: ["2v2"],
  length: 45,
  music: "mini",
  create: (ctx) => new BatailleEau(ctx),
};
export default def;
