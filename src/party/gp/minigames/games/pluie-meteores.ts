/**
 * PLUIE DE MÉTÉORES (chacun pour soi, 45 s max): a basalt plateau in a lava lake, at dusk. Meteors
 * fall where red circles grow on the ground. Some impacts leave a lava puddle for a few seconds,
 * others send a ring of fire racing along the ground: jump it (A)! Touched = blasted away, out.
 * It gets worse and worse. Last one standing wins; at 45 s the survivors share the win.
 */
import * as THREE from "three";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef, MiniResult } from "../types";
import { GEO, ball, canvasTex, cone, cyl, flat, group, toon } from "../../engine/gfx";
import { clamp, dist2, lerp } from "../../engine/util";
import { music } from "../../engine/audio";
import { T } from "../../../../i18n/lang";

/** 2 → "2nd" (English) or "第 2 名". */
const ordinal = (n: number) => T(`${n}<sup>${["st", "nd", "rd"][n - 1] ?? "th"}</sup>`, `第 ${n} 名`);

const TIME = 45;
const R = 8.4; // plateau radius (walkable)
const PR = 0.4;
const SPEED = 6;
const JUMP_V = 7.6;
const GRAV = 22;
const WAVE_V = 4.6; // shockwave speed
const WAVE_H = 0.36; // a jump must clear this
const SKY_H = 24;

interface Runner {
  x: number;
  z: number;
  vx: number;
  vz: number;
  y: number;
  vy: number;
  alive: boolean;
  fly: { t: number; vx: number; vy: number; vz: number; spin: number } | null;
}
interface Meteor {
  x: number;
  z: number;
  r: number;
  t: number;
  warn: number;
  born: number;
  puddle: boolean;
  wave: boolean;
  rock: THREE.Group;
  ring: THREE.Mesh;
  fill: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  fillMat: THREE.MeshBasicMaterial;
  sx: number;
  sz: number;
  dead: boolean;
}
interface Puddle {
  x: number;
  z: number;
  r: number;
  t: number;
  life: number;
  m: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  dead: boolean;
}
interface Wave {
  x: number;
  z: number;
  r: number;
  wall: THREE.Mesh;
  wallMat: THREE.MeshBasicMaterial;
  base: THREE.Mesh;
  baseMat: THREE.MeshBasicMaterial;
  dead: boolean;
  /** CPUs plan their jump once per wave. */
  jumpAt: number[];
}

class PluieMeteores extends BaseMini {
  private run: Runner[] = [];
  private out: number[] = [];
  private meteors: Meteor[] = [];
  private puddles: Puddle[] = [];
  private waves: Wave[] = [];
  private nextMeteor = 0.8;
  private lavaTex!: THREE.Texture;
  private puddleTex!: THREE.Texture;
  private wallGeo = new THREE.CylinderGeometry(1, 1, 1, 56, 1, true);
  private embers!: THREE.InstancedMesh;
  private emberP: { x: number; y: number; z: number; v: number; ph: number }[] = [];
  private smoke: THREE.Vector3[] = [];
  private m4 = new THREE.Matrix4();
  private hurry = false;
  private mid = false;
  private firstWave = true;
  private ended = false;
  private cpuGoal: { x: number; z: number; t: number }[] = [];

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#1c1038", "#ff7a4a"], size: 12, sun: [-0.5, 1, 0.4], sunColor: "#ffd6b8", sunIntensity: 2.3, hemi: ["#d0c4ff", "#ff9a5a", 1.35], fog: { color: "#5a2230", near: 40, far: 95 } });
    this.buildVolcano();
    const n = this.players.length;
    this.players.forEach((p, i) => {
      const a0 = (i / n) * Math.PI * 2 + Math.PI / 4;
      const x = Math.cos(a0) * 3.5,
        z = Math.sin(a0) * 3.5;
      const a = this.spawn(i, x, z, Math.atan2(-x, -z));
      a.setRing(p.char.color);
      this.run.push({ x, z, vx: 0, vz: 0, y: 0, vy: 0, alive: true, fly: null });
      this.cpuGoal.push({ x, z, t: 0 });
    });
    this.hud.players(this.players, () => T("Alive", "存活"));
    this.hud.timer(TIME);
    this.setCam([0, 30, 26], [0, 0, 0.8], 44);
  }

  // ------------------------------------------------------------ the volcano

  private buildVolcano() {
    const s = this.scene;
    // the lava lake (unlit, glowing, slowly flowing)
    this.lavaTex = canvasTex(
      256,
      256,
      (g, w) => {
        g.fillStyle = "#ff5a14";
        g.fillRect(0, 0, w, w);
        for (let k = 0; k < 26; k++) {
          const x = (k * 7919) % w,
            y = (k * 104729) % w;
          const gr = g.createRadialGradient(x, y, 2, x, y, 26 + (k % 5) * 8);
          gr.addColorStop(0, "rgba(255,230,90,0.95)");
          gr.addColorStop(1, "rgba(255,140,30,0)");
          g.fillStyle = gr;
          g.fillRect(0, 0, w, w);
        }
        // plates of cooling crust drifting on it
        for (let k = 0; k < 7; k++) {
          const x = (k * 97 + 30) % w,
            y = (k * 151 + 60) % w;
          g.fillStyle = "rgba(90,24,14,0.75)";
          g.beginPath();
          for (let j = 0; j < 7; j++) {
            const a = (j / 7) * Math.PI * 2;
            const rr = 14 + ((j * 7 + k * 3) % 5) * 4;
            g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
          }
          g.closePath();
          g.fill();
        }
      },
      true,
    );
    this.lavaTex.repeat.set(14, 14);
    const lava = new THREE.Mesh(new THREE.CircleGeometry(160, 48), new THREE.MeshBasicMaterial({ map: this.lavaTex, color: "#f0b098" }));
    lava.rotation.x = -Math.PI / 2;
    lava.position.y = -1.3;
    s.add(lava);
    // the plateau: basalt with glowing cracks
    const top = canvasTex(1024, 1024, (g, w) => {
      const c = w / 2;
      g.fillStyle = "#5e5668";
      g.fillRect(0, 0, w, w);
      for (let k = 0; k < 160; k++) {
        const x = (k * 7919) % w,
          y = (k * 6271) % w;
        g.fillStyle = k % 2 ? "#6c627a" : "#514960";
        g.beginPath();
        g.moveTo(x, y);
        for (let j = 0; j < 6; j++) {
          const a = (j / 6) * Math.PI * 2;
          g.lineTo(x + Math.cos(a) * (30 + (k % 4) * 10), y + Math.sin(a) * (30 + (k % 3) * 10));
        }
        g.closePath();
        g.fill();
      }
      // cracks with glowing lava
      g.lineCap = "round";
      for (let k = 0; k < 14; k++) {
        let x = c + Math.cos(k) * 80,
          y = c + Math.sin(k * 1.7) * 80;
        g.beginPath();
        g.moveTo(x, y);
        for (let j = 0; j < 7; j++) {
          const a = (k / 14) * Math.PI * 2 + Math.sin(j * 3 + k) * 0.5;
          x += Math.cos(a) * 55;
          y += Math.sin(a) * 55;
          g.lineTo(x, y);
        }
        g.strokeStyle = "rgba(255,90,20,0.35)";
        g.lineWidth = 16;
        g.stroke();
        g.strokeStyle = "#ff8a2a";
        g.lineWidth = 5;
        g.stroke();
      }
      // a rim of lighter stone
      g.strokeStyle = "#5a5060";
      g.lineWidth = 26;
      g.beginPath();
      g.arc(c, c, c - 14, 0, Math.PI * 2);
      g.stroke();
    });
    const plateau = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.5, R + 1.6, 2.6, 40), [toon("#2a2430"), new THREE.MeshToonMaterial({ map: top }), toon("#1a1620")]);
    plateau.position.y = -1.3;
    plateau.receiveShadow = true;
    s.add(plateau);
    // a glowing seam where rock meets lava
    const seam = new THREE.Mesh(new THREE.TorusGeometry(R + 1.55, 0.25, 6, 64), flat("#ffb040"));
    seam.rotation.x = Math.PI / 2;
    seam.position.y = -1.25;
    s.add(seam);
    // a few boulders on the rim (decor, outside the walkable area)
    const rock = toon("#3a3340");
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2 + 0.2;
      const m = new THREE.Mesh(GEO.dodeca, rock);
      m.position.set(Math.cos(a) * (R + 0.9), 0.1, Math.sin(a) * (R + 0.9));
      m.scale.set(0.5 + (k % 3) * 0.2, 0.4 + (k % 2) * 0.3, 0.5);
      m.rotation.set(k, k * 2, 0);
      m.castShadow = true;
      s.add(m);
    }
    // rock spires in the lava (not in front of the camera)
    for (let k = 0; k < 10; k++) {
      const a = Math.PI * 1.5 + (k / 9 - 0.5) * Math.PI * 1.1;
      const r = 17 + (k % 3) * 4.5;
      const h = 2.2 + (k % 4) * 1.1;
      cone(s, k % 2 ? "#2a2430" : "#3a3340", 1.1 + (k % 3) * 0.4, h, { x: Math.cos(a) * r, y: -1.3 + h / 2, z: Math.sin(a) * r, lo: true });
    }
    // volcanoes in the back, with glowing craters
    for (const [x, z, sc] of [
      [-20, -30, 1.3],
      [18, -34, 1.7],
      [36, -18, 1.0],
      [-38, -16, 1.1],
    ] as [number, number, number][]) {
      const g = group(s, { x, y: -1.3, z });
      cyl(g, "#2a2030", 3 * sc, 12 * sc, { rTop: 2.2 * sc, y: 6 * sc, seg: 9 });
      cyl(g, "#ff6a1a", 2.3 * sc, 0.3, { y: 12 * sc + 0.1, seg: 9 }).material = flat("#ff7a2a");
      cyl(g, "#1a1420", 10 * sc, 3 * sc, { rTop: 3 * sc, y: 1.5 * sc, seg: 9 });
      this.smoke.push(new THREE.Vector3(x, -1.3 + 12.4 * sc, z));
    }
    // floating embers
    const n = 90;
    this.embers = new THREE.InstancedMesh(GEO.sphereLo, flat("#ffb040", 0.9, true), n);
    this.embers.frustumCulled = false;
    for (let k = 0; k < n; k++) this.emberP.push({ x: (this.rnd() - 0.5) * 40, y: this.rnd() * 10 - 1, z: (this.rnd() - 0.5) * 30 - 2, v: 0.6 + this.rnd() * 1.2, ph: this.rnd() * 6 });
    s.add(this.embers);
    // the puddle look (shared texture, own material each)
    this.puddleTex = canvasTex(128, 128, (g, w) => {
      const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      gr.addColorStop(0, "#fff2a0");
      gr.addColorStop(0.35, "#ffb030");
      gr.addColorStop(0.8, "#ff4a10");
      gr.addColorStop(0.92, "#8a1a08");
      gr.addColorStop(1, "rgba(60,10,5,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, w, w);
    });
  }

  // ------------------------------------------------------------ hazards

  private intensity() {
    return clamp(this.t / TIME, 0, 1);
  }

  private spawnMeteor() {
    const k = this.intensity();
    const alive = this.run.map((r, i) => (r.alive ? i : -1)).filter((i) => i >= 0);
    let x = 0,
      z = 0;
    if (alive.length && this.rnd() < 0.45 + 0.25 * k) {
      // aim near someone
      const r = this.run[alive[Math.floor(this.rnd() * alive.length)]];
      x = r.x + r.vx * 0.4 + (this.rnd() - 0.5) * 2.5;
      z = r.z + r.vz * 0.4 + (this.rnd() - 0.5) * 2.5;
    } else {
      const a = this.rnd() * Math.PI * 2,
        rr = Math.sqrt(this.rnd()) * (R - 0.8);
      x = Math.cos(a) * rr;
      z = Math.sin(a) * rr;
    }
    const l = Math.hypot(x, z);
    if (l > R - 0.6) {
      x *= (R - 0.6) / l;
      z *= (R - 0.6) / l;
    }
    const big = this.rnd() < 0.15 + 0.2 * k;
    const r = (big ? 1.9 : 1.3) + this.rnd() * 0.3;
    const warn = lerp(1.7, 1.05, k) + (big ? 0.3 : 0);
    const roll = this.rnd();
    // no rings of fire for the first seconds: time to understand the circles first
    const wave = this.t < 7 ? false : big ? roll < 0.75 : roll < 0.12 + 0.25 * k;
    const puddle = !wave && this.rnd() < 0.55;
    // the rock
    const rock = group(this.scene);
    const core = new THREE.Mesh(GEO.dodeca, toon("#3a2a2a", "#ff4a10", 0.5));
    core.scale.setScalar(big ? 0.95 : 0.65);
    core.castShadow = true;
    rock.add(core);
    ball(rock, flat("#ffb040", 0.7, true), big ? 1.25 : 0.9, { cast: false });
    // the target circle
    const ringMat = new THREE.MeshBasicMaterial({ color: "#ff2a1a", transparent: true, opacity: 0.85, depthWrite: false });
    const ring = new THREE.Mesh(GEO.ring, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.05, z);
    ring.renderOrder = 2;
    const fillMat = new THREE.MeshBasicMaterial({ color: "#ff3a1a", transparent: true, opacity: 0.1, depthWrite: false });
    const fill = new THREE.Mesh(GEO.circle, fillMat);
    fill.rotation.x = -Math.PI / 2;
    fill.position.set(x, 0.04, z);
    fill.renderOrder = 1;
    this.scene.add(ring, fill);
    // it comes in at a slant
    const sa = this.rnd() * Math.PI * 2;
    this.meteors.push({ x, z, r, t: 0, warn, born: this.t, puddle, wave, rock, ring, fill, ringMat, fillMat, sx: Math.cos(sa) * 9, sz: -6 - this.rnd() * 6, dead: false });
    this.sound("whoosh");
  }

  private impact(m: Meteor) {
    m.dead = true;
    m.rock.removeFromParent();
    m.ring.removeFromParent();
    m.fill.removeFromParent();
    m.ringMat.dispose();
    m.fillMat.dispose();
    this.fx.explosion({ x: m.x, y: 0.4, z: m.z }, m.r * 1.6);
    this.fx.burst({ x: m.x, y: 0.3, z: m.z }, { count: 18, colors: ["#3a3340", "#5a5060", "#ff8a2a"], speed: 7, up: 6, gravity: 18, size: 0.22, life: 0.9 });
    this.sound("explode");
    this.shake = Math.max(this.shake, m.r > 1.7 ? 0.7 : 0.4);
    // everyone inside the circle is blasted away
    this.run.forEach((r, i) => {
      if (!r.alive || this.finished) return;
      if (dist2(r.x, r.z, m.x, m.z) < m.r + PR * 0.6) this.blast(i, m.x, m.z, T("Boom!", "轰！"));
    });
    if (m.puddle) {
      const mat = new THREE.MeshBasicMaterial({ map: this.puddleTex, transparent: true, depthWrite: false });
      const pm = new THREE.Mesh(GEO.circle, mat);
      pm.rotation.x = -Math.PI / 2;
      pm.position.set(m.x, 0.03, m.z);
      pm.renderOrder = 1;
      this.scene.add(pm);
      this.puddles.push({ x: m.x, z: m.z, r: m.r * 0.85, t: 0, life: 3.2 + this.rnd() * 1.2, m: pm, mat, dead: false });
    }
    if (m.wave) {
      const wallMat = new THREE.MeshBasicMaterial({ color: "#ffb040", transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const wall = new THREE.Mesh(this.wallGeo, wallMat);
      wall.position.set(m.x, WAVE_H / 2, m.z);
      const baseMat = new THREE.MeshBasicMaterial({ color: "#ff5a1a", transparent: true, opacity: 0.9, depthWrite: false });
      const base = new THREE.Mesh(GEO.ring, baseMat);
      base.rotation.x = -Math.PI / 2;
      base.position.set(m.x, 0.06, m.z);
      base.renderOrder = 2;
      this.scene.add(wall, base);
      this.waves.push({ x: m.x, z: m.z, r: m.r * 0.6, wall, wallMat, base, baseMat, dead: false, jumpAt: this.players.map(() => -1) });
      this.sound("rumble");
      if (this.firstWave && !this.finished) {
        this.firstWave = false;
        this.hud.banner(T("Jump! (A)", "跳！(A)"), { color: "#ffb040", size: 7, sub: T("over the ring of fire", "跳过火圈"), ms: 1100 });
      }
    }
  }

  private blast(i: number, fx: number, fz: number, label: string) {
    const r = this.run[i];
    const a = this.avatars[i];
    r.alive = false;
    const dx = r.x - fx,
      dz = r.z - fz,
      d = Math.hypot(dx, dz) || 1;
    r.fly = { t: 0, vx: (dx / d) * 6 + (this.rnd() - 0.5) * 2, vy: 15, vz: (dz / d) * 6 - 2, spin: (this.rnd() < 0.5 ? -1 : 1) * 12 };
    a.anim = "fall";
    a.flash();
    a.setRing(null);
    this.out.push(i);
    const place = this.players.length - this.out.length + 1;
    this.hud.setScore(this.players[i].seat, `${label} ${ordinal(place)}`);
    this.hud.mark(this.players[i].seat, "out");
    this.hud.pop(new THREE.Vector3(r.x, 2.4, r.z), label, "#ff8a3c", this.camera);
    this.buzz(i, [120, 60, 160]);
    this.sound("crash");
    const alive = this.run.filter((o) => o.alive).length;
    if (alive >= 2) this.hud.banner(alive === 2 ? T("Final two!", "只剩两个！") : T(`${alive} left!`, `只剩 ${alive} 个！`), { color: "#ffd23f", size: 6, ms: 900 });
  }

  // ------------------------------------------------------------ CPUs

  protected cpu(i: number, dt: number): CpuPad {
    const me = this.run[i];
    if (!me.alive) return {};
    const lv = this.players[i].level;
    // airborne: let the jump play out
    if (me.y > 0) return {};
    const react = 0.55 - 0.4 * lv;
    // jump the fire rings at the right moment
    let jump = false;
    let ringNear = false;
    for (const w of this.waves) {
      if (w.dead) continue;
      const d = dist2(me.x, me.z, w.x, w.z) || 1;
      // how fast the ring closes in on me (my own running counts)
      const away = (me.vx * (me.x - w.x) + me.vz * (me.z - w.z)) / d;
      const close = WAVE_V - away;
      const gap = d - w.r;
      if (gap < -0.3 || close <= 0.2) continue;
      const eta = gap / close;
      if (eta > 1.2) continue;
      ringNear = true;
      if (w.jumpAt[i] < 0) {
        // decided once per ring: experts time it well, beginners are sloppy (or forget)
        const forget = Math.random() < 0.15 * (1 - lv);
        w.jumpAt[i] = forget ? 99 : 0.26 + (Math.random() - 0.5) * 0.36 * (1 - lv);
      }
      if (w.jumpAt[i] < 98 && eta <= w.jumpAt[i] && me.y <= 0.01) jump = true;
    }
    // where is it safe? sample spots around me and pick the best one
    const g = this.cpuGoal[i];
    g.t -= dt;
    const danger = (x: number, z: number) => {
      let s = 0;
      const dc = Math.hypot(x, z);
      if (dc > R - 0.8) s += 6 + (dc - R + 0.8) * 6;
      s += dc * 0.08;
      for (const m of this.meteors) {
        if (m.dead || this.t - m.born < react) continue;
        const left = m.warn - m.t;
        const d = dist2(x, z, m.x, m.z);
        const margin = 0.5 + 0.7 * lv;
        if (d < m.r + margin) s += 10 + (m.r + margin - d) * 4 + (left < 0.5 ? 6 : 0);
      }
      for (const p of this.puddles) {
        if (p.dead) continue;
        const d = dist2(x, z, p.x, p.z);
        if (d < p.r + 0.9) s += 14 + (p.r + 0.9 - d) * 5;
      }
      for (let j = 0; j < this.run.length; j++) {
        if (j === i || !this.run[j].alive) continue;
        const d = dist2(x, z, this.run[j].x, this.run[j].z);
        if (d < 1.6) s += (1.6 - d) * 1.5;
      }
      return s;
    };
    const here = danger(me.x, me.z);
    if (g.t <= 0 || danger(g.x, g.z) > here + 0.5 || here > 5) {
      g.t = 0.25 + (1 - lv) * 0.35;
      let bx = me.x,
        bz = me.z,
        bs = here - 0.3;
      for (const rad of [1.4, 2.8, 4.2]) {
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2 + i;
          const x = me.x + Math.cos(a) * rad,
            z = me.z + Math.sin(a) * rad;
          // path check: don't run through a puddle on the way
          let s = danger(x, z) + rad * 0.12;
          for (const p of this.puddles) if (!p.dead && this.segDist(me.x, me.z, x, z, p.x, p.z) < p.r + 0.5) s += 12;
          if (s < bs) {
            bs = s;
            bx = x;
            bz = z;
          }
        }
      }
      g.x = bx;
      g.z = bz;
    }
    const dx = g.x - me.x,
      dz = g.z - me.z;
    const d = Math.hypot(dx, dz);
    const wob = (1 - lv) * 0.3;
    if (ringNear && here < 5 && lv >= 0.45) return { x: 0, y: 0, a: jump };
    if (d < 0.25) return { x: Math.sin(this.t * 2 + i) * wob * 0.5, y: Math.cos(this.t * 1.7 + i) * wob * 0.5, a: jump };
    const sp = clamp(d * 1.5, 0.3, 1);
    return { x: (dx / d) * sp + Math.sin(this.t * 2.2 + i) * wob, y: (dz / d) * sp + Math.cos(this.t * 1.9 + i) * wob, a: jump };
  }

  private segDist(ax: number, az: number, bx: number, bz: number, px: number, pz: number) {
    const vx = bx - ax,
      vz = bz - az;
    const l2 = vx * vx + vz * vz || 1;
    const t = clamp(((px - ax) * vx + (pz - az) * vz) / l2, 0, 1);
    return dist2(ax + vx * t, az + vz * t, px, pz);
  }

  // ------------------------------------------------------------ the game

  protected idle(dt: number) {
    this.moveCam([0, 16.5, 13.5], [0, 0, 0.8], dt, 1.6);
    this.ambient(dt);
  }

  protected step(dt: number) {
    const left = TIME - this.t;
    this.hud.timer(left);
    this.moveCam([0, 16.5, 13.5], [0, 0, 0.8], dt, 3);
    this.ambient(dt);
    const k = this.intensity();
    if (!this.mid && this.t >= 20) {
      this.mid = true;
      this.hud.banner(T("Heating up!", "升温了！"), { color: "#ff8a3c", sub: T("Twice the meteors", "流星加倍") });
      this.sound("rumble");
      music.speed(1.1);
    }
    if (!this.hurry && left <= 10) {
      this.hurry = true;
      this.hud.banner(T("10 seconds left!", "还剩 10 秒！"), { color: "#ffd23f" });
      this.sound("bell");
      music.speed(1.2);
    }
    // the rain
    this.nextMeteor -= dt;
    if (this.nextMeteor <= 0) {
      this.spawnMeteor();
      if (k > 0.55 && this.rnd() < k * 0.5) this.spawnMeteor();
      this.nextMeteor = lerp(1.15, 0.45, k) * (0.75 + this.rnd() * 0.5);
    }
    this.updateHazards(dt, true);
    this.movePlayers(dt, true);
    const alive = this.run.filter((r) => r.alive).length;
    if (!this.ended && (alive <= 1 || left <= 0)) {
      this.ended = true;
      this.finishByElimination(this.out);
    }
  }

  protected outroStep(dt: number) {
    this.ambient(dt);
    this.updateHazards(dt, false);
    this.movePlayers(dt, false);
  }

  protected celebrate(res: MiniResult) {
    this.avatars.forEach((a, i) => {
      const r = this.run[i];
      if (r.alive) {
        a.anim = res.place[i] === 1 ? "win" : "idle";
        if (res.place[i] === 1) this.fx.confetti({ x: r.x, y: 3, z: r.z }, 60);
      }
    });
  }

  private ambient(dt: number) {
    const now = performance.now() / 1000;
    this.lavaTex.offset.x += dt * 0.015;
    this.lavaTex.offset.y += dt * 0.008;
    this.emberP.forEach((p, k) => {
      p.y += p.v * dt;
      if (p.y > 11) p.y = -1;
      const s = 0.05 + 0.03 * Math.sin(now * 5 + p.ph);
      this.m4.makeScale(s, s, s);
      this.m4.setPosition(p.x + Math.sin(now * 0.7 + p.ph) * 0.8, p.y, p.z);
      this.embers.setMatrixAt(k, this.m4);
    });
    this.embers.instanceMatrix.needsUpdate = true;
    for (const v of this.smoke) if (Math.random() < 0.25) this.fx.burst(v, { count: 1, colors: ["#3a2a3a", "#5a3a4a", "#ff7a2a"], speed: 0.6, up: 3, gravity: -0.6, size: 1.4, sizeEnd: 2.6, life: 2.6, shape: "ball", drag: 0.5 });
  }

  private updateHazards(dt: number, live: boolean) {
    for (const m of this.meteors) {
      if (m.dead) continue;
      m.t += dt;
      const k = clamp(m.t / m.warn, 0, 1);
      // circle grows; the rock comes down along a slant
      m.ring.scale.setScalar(m.r * (0.35 + 0.65 * Math.min(1, k * 1.4)));
      m.fill.scale.setScalar(m.r * k);
      m.fillMat.opacity = 0.12 + 0.3 * k;
      m.ringMat.opacity = 0.6 + 0.4 * (Math.sin(m.t * (10 + 20 * k)) > 0 ? 1 : 0.3);
      const f = 1 - k;
      m.rock.position.set(m.x + m.sx * f, 0.3 + SKY_H * f, m.z + m.sz * f);
      m.rock.rotation.x += dt * 4;
      m.rock.rotation.z += dt * 3;
      if (Math.random() < 0.9) this.fx.burst(m.rock.position, { count: 1, colors: ["#ffd23f", "#ff8a2a", "#ff4a10"], speed: 0.8, gravity: -1, size: 0.45, sizeEnd: 0.05, life: 0.45, shape: "ball" });
      if (k >= 1) this.impact(m);
    }
    this.meteors = this.meteors.filter((m) => !m.dead);
    for (const p of this.puddles) {
      if (p.dead) continue;
      p.t += dt;
      const grow = clamp(p.t / 0.25, 0, 1);
      const cool = clamp((p.life - p.t) / 0.8, 0, 1);
      p.m.scale.setScalar(p.r * 1.15 * grow * (1 + Math.sin(p.t * 6) * 0.03));
      p.mat.opacity = cool;
      if (Math.random() < 0.2) this.fx.burst({ x: p.x + (Math.random() - 0.5) * p.r, y: 0.1, z: p.z + (Math.random() - 0.5) * p.r }, { count: 1, colors: ["#ffd23f", "#ff8a2a"], speed: 1, up: 2.5, gravity: 8, size: 0.12, life: 0.5, shape: "ball" });
      if (live && cool > 0.4)
        this.run.forEach((r, i) => {
          if (r.alive && r.y < 0.3 && dist2(r.x, r.z, p.x, p.z) < p.r * 0.9 + PR * 0.3) this.blast(i, p.x, p.z, T("Ouch!", "哎哟！"));
        });
      if (p.t >= p.life) {
        p.dead = true;
        p.m.removeFromParent();
        p.mat.dispose();
      }
    }
    this.puddles = this.puddles.filter((p) => !p.dead);
    for (const w of this.waves) {
      if (w.dead) continue;
      const r0 = w.r;
      w.r += WAVE_V * dt;
      w.wall.scale.set(w.r, WAVE_H, w.r);
      w.base.scale.setScalar(w.r * 1.12);
      const fade = clamp((R + 3 - w.r) / 3, 0, 1);
      w.wallMat.opacity = 0.85 * fade;
      w.baseMat.opacity = 0.9 * fade;
      if (live)
        this.run.forEach((r, i) => {
          if (!r.alive || r.y > WAVE_H) return;
          const d = dist2(r.x, r.z, w.x, w.z);
          if (d - PR * 0.6 <= w.r && d + PR * 0.6 >= r0) this.blast(i, w.x, w.z, T("Burnt!", "烧焦了！"));
        });
      if (Math.random() < 0.5) {
        const a = Math.random() * Math.PI * 2;
        this.fx.burst({ x: w.x + Math.cos(a) * w.r, y: 0.2, z: w.z + Math.sin(a) * w.r }, { count: 1, colors: ["#ffd23f", "#ff8a2a"], speed: 0.5, up: 2, gravity: 4, size: 0.18, life: 0.4, shape: "ball" });
      }
      if (w.r > R + 3) {
        w.dead = true;
        w.wall.removeFromParent();
        w.base.removeFromParent();
        w.wallMat.dispose();
        w.baseMat.dispose();
      }
    }
    this.waves = this.waves.filter((w) => !w.dead);
  }

  private movePlayers(dt: number, live: boolean) {
    this.run.forEach((r, i) => {
      const a = this.avatars[i];
      if (r.fly) {
        const f = r.fly;
        f.t += dt;
        f.vy -= 14 * dt;
        r.x += f.vx * dt;
        r.y += f.vy * dt;
        r.z += f.vz * dt;
        a.pos.set(r.x, r.y, r.z);
        a.root.rotation.order = "YXZ";
        a.root.rotation.x += f.spin * dt;
        a.groundY = -50;
        if (Math.random() < 0.6) this.fx.burst({ x: r.x, y: r.y + 0.6, z: r.z }, { count: 1, colors: ["#3a3440", "#6a6470"], speed: 0.4, gravity: -1, size: 0.35, sizeEnd: 0.05, life: 0.8, shape: "ball" });
        if (f.t > 2.2) {
          this.fx.sparkle(a.pos, "#ffffff", 10);
          a.setVisible(false);
          r.fly = null;
        }
        return;
      }
      if (!r.alive) return;
      const p = live ? this.pad(i) : { x: 0, y: 0, aDown: false };
      // in the air: momentum is kept, the stick only nudges it
      const air = r.y > 0;
      if (!air || Math.hypot(p.x, p.y) > 0.1) {
        const k = 1 - Math.exp(-(air ? 3 : 12) * dt);
        r.vx += (p.x * SPEED - r.vx) * k;
        r.vz += (p.y * SPEED - r.vz) * k;
      }
      if (p.aDown && r.y <= 0.001) {
        r.vy = JUMP_V;
        this.sound("jump");
      }
      if (r.y > 0 || r.vy > 0) {
        r.vy -= GRAV * dt;
        r.y += r.vy * dt;
        if (r.y <= 0) {
          r.y = 0;
          r.vy = 0;
          this.fx.dust({ x: r.x, y: 0, z: r.z }, 4, "#6a6070");
        }
      }
      r.x += r.vx * dt;
      r.z += r.vz * dt;
      const d = Math.hypot(r.x, r.z);
      if (d > R - PR) {
        r.x *= (R - PR) / d;
        r.z *= (R - PR) / d;
        // the rim stops you: no more outward speed
        const out = (r.vx * r.x + r.vz * r.z) / (R - PR);
        if (out > 0) {
          r.vx -= (out * r.x) / (R - PR);
          r.vz -= (out * r.z) / (R - PR);
        }
      }
      const sp = Math.hypot(r.vx, r.vz);
      if (sp > 0.5) a.face(Math.atan2(r.vx, r.vz), dt);
      if (live) a.anim = r.y > 0 ? "jump" : sp > 0.6 ? "run" : "idle";
      a.speed = clamp(sp / SPEED, 0, 1);
      a.pos.set(r.x, r.y, r.z);
      a.groundY = 0;
    });
    for (let i = 0; i < this.run.length; i++)
      for (let j = i + 1; j < this.run.length; j++) {
        const A = this.run[i],
          B = this.run[j];
        if (!A.alive || !B.alive) continue;
        const dx = B.x - A.x,
          dz = B.z - A.z;
        const d = Math.hypot(dx, dz);
        if (d < PR * 2 && d > 1e-4) {
          const push = (PR * 2 - d) / 2;
          A.x -= (dx / d) * push;
          A.z -= (dz / d) * push;
          B.x += (dx / d) * push;
          B.z += (dz / d) * push;
        }
      }
  }

  dispose() {
    this.wallGeo.dispose();
    super.dispose();
  }
}

const def: MiniDef = {
  id: "pluie-meteores",
  name: "Meteor Shower",
  icon: "☄️",
  color: "#ff7a3e",
  tagline: "Dodge the meteors; last one standing wins.",
  rules: "Flee the red circles: a meteor lands there! Avoid the lava pools and jump (A) the rings of fire. Last one standing wins.",
  controls: { stick: "Run", a: "Jump" },
  modes: ["ffa"],
  length: 45,
  music: "tense",
  create: (ctx) => new PluieMeteores(ctx),
};
export default def;
