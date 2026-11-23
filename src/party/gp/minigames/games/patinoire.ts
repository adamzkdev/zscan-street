/**
 * PATINOIRE ÉTOILÉE (chacun pour soi, 40 s): a frozen lake at night among snowy pines and lanterns.
 * The ice is slippery: you build up speed and drift. Stars pop up here and there (1 point), now and
 * then a big golden star (3 points). A = a shove: bump a rival and they spin away, stunned 0.7 s.
 * Most stars wins.
 */
import * as THREE from "three";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef, MiniResult } from "../types";
import { GEO, ball, blobShadow, canvasTex, cone, cyl, flat, group, pine, starGeo, toon } from "../../engine/gfx";
import { STAR } from "../../engine/hud";
import { angDiff, clamp, dist2 } from "../../engine/util";
import { music } from "../../engine/audio";
import { T } from "../../../../i18n/lang";

const TIME = 40;
const RX = 10.2; // the lake is an ellipse
const RZ = 6.9;
const PR = 0.45;
const ACC = 10.5;
const DRAG = 0.55;
const VMAX = 8.6;
const SHOVE_V = 8.5;
const SHOVE_T = 0.3;
const SHOVE_CD = 1.0;
const STUN = 0.7;
const MAX_STARS = 4;

interface Skater {
  x: number;
  z: number;
  vx: number;
  vz: number;
  stars: number;
  shoveT: number;
  shoveCd: number;
  stun: number;
  spin: number;
  safe: number;
  phase: number;
}
interface StarItem {
  g: THREE.Group;
  sh: THREE.Mesh;
  x: number;
  z: number;
  value: number;
  age: number;
  life: number;
  dead: boolean;
}

/**
 * Static decor → one InstancedMesh per (geometry, material): the same look with far fewer draw calls.
 * Meshes with equal geometry parameters are merged too. Returns the instanced meshes (free them in dispose()).
 */
function bake(src: THREE.Object3D, dst: THREE.Object3D): THREE.InstancedMesh[] {
  src.updateMatrixWorld(true);
  const sets = new Map<string, { geo: THREE.BufferGeometry; mat: THREE.Material; list: THREE.Matrix4[]; cast: boolean }>();
  const all = new Set<THREE.BufferGeometry>();
  src.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material)) return;
    const g = m.geometry as THREE.BufferGeometry & { parameters?: unknown };
    all.add(g);
    const gk = g.userData?.shared || !g.parameters ? g.uuid : g.type + JSON.stringify(g.parameters);
    const key = `${gk}|${m.material.uuid}`;
    let set = sets.get(key);
    if (!set) sets.set(key, (set = { geo: g, mat: m.material, list: [], cast: false }));
    set.list.push(m.matrixWorld.clone());
    set.cast ||= m.castShadow;
  });
  const out: THREE.InstancedMesh[] = [];
  const used = new Set<THREE.BufferGeometry>();
  for (const set of sets.values()) {
    const im = new THREE.InstancedMesh(set.geo, set.mat, set.list.length);
    set.list.forEach((m4, k) => im.setMatrixAt(k, m4));
    im.castShadow = set.cast;
    im.receiveShadow = true;
    dst.add(im);
    out.push(im);
    used.add(set.geo);
  }
  for (const g of all) if (!used.has(g) && !g.userData?.shared) g.dispose();
  return out;
}

class Patinoire extends BaseMini {
  private sk: Skater[] = [];
  private items: StarItem[] = [];
  private nextStar = 0.3;
  private nextBig = 7;
  private starGeoS = starGeo(0.42, 0.18);
  private starGeoB = starGeo(0.78, 0.3);
  private glowTex!: THREE.Texture;
  private flakes!: THREE.InstancedMesh;
  private flakeP: { x: number; y: number; z: number; s: number; ph: number }[] = [];
  private m4 = new THREE.Matrix4();
  private hurry = false;
  private cpuT: { target: StarItem | null; re: number }[] = [];
  private baked: THREE.InstancedMesh[] = [];

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#070c26", "#24346a"], size: 13, sun: [0.3, 1, 0.6], sunColor: "#b8c8ff", sunIntensity: 1.35, hemi: ["#8a9ae0", "#22224a", 1.2], fog: { color: "#141c40", near: 30, far: 70 } });
    this.buildLake();
    const starts = [
      [-5, -3],
      [5, -3],
      [-5, 3],
      [5, 3],
    ];
    this.players.forEach((p, i) => {
      const [x, z] = starts[i];
      const a = this.spawn(i, x, z, Math.atan2(-x, -z));
      a.setRing(p.char.color);
      a.root.rotation.order = "YXZ";
      this.sk.push({ x, z, vx: 0, vz: 0, stars: 0, shoveT: 0, shoveCd: 0, stun: 0, spin: 0, safe: 0, phase: i * 1.3 });
      this.cpuT.push({ target: null, re: 0 });
    });
    this.hud.players(this.players, () => `${STAR} 0`);
    this.hud.timer(TIME);
    this.setCam([0, 30, 25], [0, 0, 0.6], 44);
  }

  // ------------------------------------------------------------ the lake

  private buildLake() {
    const s = this.scene;
    // snow all around (with a soft blue tint at night)
    const snow = new THREE.Mesh(new THREE.CircleGeometry(70, 48), toon("#aab6e8"));
    snow.rotation.x = -Math.PI / 2;
    snow.position.y = -0.05;
    snow.receiveShadow = true;
    s.add(snow);
    // the ice: pale blue with skate scratches and a few cracks
    const ice = canvasTex(1024, 700, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, w * 0.55);
      gr.addColorStop(0, "#9ed4f4");
      gr.addColorStop(0.7, "#78b4e0");
      gr.addColorStop(1, "#5a92c8");
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
      g.strokeStyle = "rgba(225,245,255,0.5)";
      g.lineCap = "round";
      for (let k = 0; k < 60; k++) {
        g.lineWidth = 1 + (k % 3);
        const cx = (k * 7919) % w,
          cy = (k * 6271) % h;
        g.beginPath();
        g.ellipse(cx, cy, 60 + (k % 7) * 30, 20 + (k % 5) * 14, k * 0.7, 0, Math.PI * (0.4 + (k % 4) * 0.2));
        g.stroke();
      }
      g.strokeStyle = "rgba(90,150,200,0.5)";
      g.lineWidth = 2;
      for (let k = 0; k < 6; k++) {
        let x = (k * 211) % w,
          y = (k * 137) % h;
        g.beginPath();
        g.moveTo(x, y);
        for (let j = 0; j < 6; j++) {
          x += Math.cos(k + j * 1.3) * 40;
          y += Math.sin(k * 2 + j) * 40;
          g.lineTo(x, y);
        }
        g.stroke();
      }
    });
    const lake = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshToonMaterial({ map: ice }));
    lake.rotation.x = -Math.PI / 2;
    lake.scale.set(RX + 0.4, RZ + 0.4, 1);
    lake.position.y = 0.01;
    lake.receiveShadow = true;
    s.add(lake);
    // static decor goes in here, then gets baked into instanced meshes
    const d = new THREE.Group();
    // snow banks around the ice
    const n = 44;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const x = Math.cos(a) * (RX + 0.9),
        z = Math.sin(a) * (RZ + 0.9);
      ball(d, k % 2 ? "#c8d4f4" : "#bac8ee", [0.7, 0.32 + (k % 3) * 0.08, 0.6], { x, y: 0.02, z, ry: -a, lo: true });
    }
    // lantern glow texture (fake light pools)
    this.glowTex = canvasTex(64, 64, (g, w) => {
      const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      gr.addColorStop(0, "rgba(255,170,70,0.9)");
      gr.addColorStop(1, "rgba(255,120,30,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, w, w);
    });
    const glowMat = new THREE.MeshBasicMaterial({ map: this.glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6 });
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      const x = Math.cos(a) * (RX + 2.4),
        z = Math.sin(a) * (RZ + 2.4);
      const g = group(d, { x, z });
      cyl(g, "#3a2a20", 0.08, 2.6, { y: 1.3, seg: 6 });
      box4(g);
      const pool = new THREE.Mesh(GEO.circle, glowMat);
      pool.rotation.x = -Math.PI / 2;
      pool.position.y = 0.04;
      pool.scale.setScalar(3.2);
      g.add(pool);
    }
    function box4(g: THREE.Group) {
      // a little lantern: frame, warm glass, cap with snow
      cyl(g, "#2a2030", 0.24, 0.08, { y: 2.6, seg: 6 });
      ball(g, toon("#ffe08a", "#ffb030", 1.1), [0.2, 0.28, 0.2], { y: 2.85, cast: false });
      cone(g, "#2a2030", 0.3, 0.25, { y: 3.2, lo: true });
      cone(g, "#ffffff", 0.24, 0.12, { y: 3.32, lo: true });
    }
    // snowy pines
    const snowyPine = (x: number, z: number, sc: number) => {
      const g = pine(d, x, z, sc, "#1f6a4a");
      cone(g, "#ffffff", 0.5 * sc, 0.35 * sc, { y: 1.95 * sc, lo: true });
      cone(g, "#ffffff", 0.72 * sc, 0.3 * sc, { y: 1.45 * sc, lo: true });
      cone(g, "#ffffff", 0.9 * sc, 0.25 * sc, { y: 0.95 * sc, lo: true });
    };
    for (let k = 0; k < 26; k++) {
      const a = (k / 26) * Math.PI * 2 + 0.13;
      const rr = 1 + (k % 3) * 0.12;
      snowyPine(Math.cos(a) * (RX + 5.2) * rr, Math.sin(a) * (RZ + 5) * rr, 1.4 + (k % 4) * 0.3);
    }
    // a small cabin with a lit window
    const cab = group(d, { x: -15.5, z: -9.5, ry: 0.6 });
    for (let k = 0; k < 6; k++) cyl(cab, k % 2 ? "#8a5a32" : "#7a4a2a", 0.22, 4.4, { y: 0.25 + k * 0.42, rz: Math.PI / 2, seg: 8 });
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 3, 1), toon("#ffffff"));
    roof.rotation.z = Math.PI / 2;
    roof.scale.set(2.2, 4.8, 2.2);
    roof.position.y = 3.1;
    roof.castShadow = true;
    cab.add(roof);
    ball(cab, toon("#ffe08a", "#ffb030", 1), [0.4, 0.35, 0.05], { y: 1.3, z: 0.25, cast: false });
    cyl(cab, "#5a5a6a", 0.25, 1.2, { x: 1.2, y: 3.8, seg: 8 });
    this.baked = bake(d, s);
    // falling snow
    const fn = 120;
    this.flakes = new THREE.InstancedMesh(GEO.sphereLo, flat("#ffffff", 0.85), fn);
    this.flakes.frustumCulled = false;
    for (let k = 0; k < fn; k++) this.flakeP.push({ x: (this.rnd() - 0.5) * 34, y: this.rnd() * 14, z: (this.rnd() - 0.5) * 26, s: 0.04 + this.rnd() * 0.04, ph: this.rnd() * 6 });
    s.add(this.flakes);
  }

  // ------------------------------------------------------------ stars

  private spawnStar(value: number) {
    let x = 0,
      z = 0;
    for (let tries = 0; tries < 20; tries++) {
      const a = this.rnd() * Math.PI * 2,
        r = Math.sqrt(this.rnd()) * 0.85;
      x = Math.cos(a) * r * (RX - 1);
      z = Math.sin(a) * r * (RZ - 1);
      if (this.sk.every((s) => dist2(s.x, s.z, x, z) > 2.6) && this.items.every((it) => it.dead || dist2(it.x, it.z, x, z) > 2)) break;
    }
    const g = group(this.scene, { x, y: 0.9, z });
    const big = value >= 3;
    const m = new THREE.Mesh(big ? this.starGeoB : this.starGeoS, toon("#ffd23f", "#ff9a00", big ? 0.75 : 0.45));
    // tilted back so the camera sees its face
    m.rotation.x = -0.55;
    m.name = "star";
    m.castShadow = true;
    g.add(m);
    if (big) {
      const halo = ball(g, flat("#ffc83a", 0.3, true), 1.1, { cast: false });
      halo.name = "halo";
    }
    g.scale.setScalar(0.01);
    const sh = blobShadow(big ? 0.75 : 0.45, 0.35);
    sh.position.set(x, 0.03, z);
    this.scene.add(sh);
    this.items.push({ g, sh, x, z, value, age: 0, life: big ? 9 : 10, dead: false });
    if (big) {
      this.sound("magic");
      this.hud.banner(T("BIG GOLD STAR!", "大金星！"), { color: "#ffd23f", size: 5, ms: 900, sub: "+3" });
      this.fx.ring({ x, y: 0.05, z }, "#ffd23f", 2.4, 0.6);
    } else this.sound("pop");
  }

  private removeStar(it: StarItem) {
    it.dead = true;
    it.g.removeFromParent();
    it.sh.removeFromParent();
    (it.sh.material as THREE.Material).dispose();
  }

  // ------------------------------------------------------------ CPUs

  protected cpu(i: number, dt: number): CpuPad {
    const me = this.sk[i];
    if (me.stun > 0) return {};
    const lv = this.players[i].level;
    const c = this.cpuT[i];
    c.re -= dt;
    // pick the best star: value against the time to get there (momentum counts)
    if (c.re <= 0 || !c.target || c.target.dead) {
      c.re = 0.35 + (1 - lv) * 0.5;
      let best: StarItem | null = null,
        bs = -1;
      for (const it of this.items) {
        if (it.dead || it.age < 0.3) continue;
        const dx = it.x - me.x,
          dz = it.z - me.z;
        const d = Math.hypot(dx, dz);
        // moving toward it already helps; experts see that better
        const along = (me.vx * dx + me.vz * dz) / (d || 1);
        let eta = d / 6 - along * 0.08 * (0.3 + lv);
        // a rival much closer to it?
        let rival = 0;
        for (let j = 0; j < this.sk.length; j++) if (j !== i && dist2(this.sk[j].x, this.sk[j].z, it.x, it.z) < d * 0.6) rival += 0.4 * lv;
        eta = Math.max(0.2, eta + rival);
        const sc = (it.value * (1 + lv * 0.5)) / (eta + 0.5) + (c.target === it ? 0.3 : 0) + Math.random() * 0.2 * (1 - lv);
        if (sc > bs) {
          bs = sc;
          best = it;
        }
      }
      c.target = best;
    }
    // shove a rival who's in the way or about to grab "my" star
    if (me.shoveCd <= 0) {
      for (let j = 0; j < this.sk.length; j++) {
        if (j === i) continue;
        const o = this.sk[j];
        if (o.stun > 0 || o.safe > 0) continue;
        const dx = o.x - me.x + (o.vx - me.vx) * 0.12,
          dz = o.z - me.z + (o.vz - me.vz) * 0.12;
        const d = Math.hypot(dx, dz);
        if (d < 1.9 && this.cpuAfter(i, "shove", 0.5 - 0.35 * lv) && Math.random() < 0.3 + 0.5 * lv) {
          this.cpuReset(i, "shove");
          return { x: dx / d, y: dz / d, a: true };
        }
      }
    }
    let tx = 0,
      tz = 0;
    if (c.target) {
      tx = c.target.x;
      tz = c.target.z;
    }
    // steer: wished velocity toward the target, the stick corrects the drift (better with level)
    const dx = tx - me.x,
      dz = tz - me.z;
    const d = Math.hypot(dx, dz) || 1;
    const want = Math.min(VMAX, 2 + d * (1.2 + 0.6 * lv));
    const ex = (dx / d) * want - me.vx * (0.4 + 0.6 * lv),
      ez = (dz / d) * want - me.vz * (0.4 + 0.6 * lv);
    const el = Math.hypot(ex, ez) || 1;
    const wob = (1 - lv) * 0.35;
    return { x: ex / el + Math.sin(this.t * 2.3 + i) * wob, y: ez / el + Math.cos(this.t * 1.9 + i) * wob };
  }

  // ------------------------------------------------------------ the game

  start() {
    this.spawnStar(1);
    this.spawnStar(1);
  }

  protected idle(dt: number) {
    this.moveCam([0, 15.5, 13], [0, 0, 0.6], dt, 1.6);
    this.snow(dt);
    this.placeSkaters(dt);
  }

  protected step(dt: number) {
    const left = TIME - this.t;
    this.hud.timer(left);
    this.moveCam([0, 15.5, 13], [0, 0, 0.6], dt, 3);
    this.snow(dt);
    if (!this.hurry && left <= 10) {
      this.hurry = true;
      this.hud.banner(T("10 SECONDS LEFT!", "还剩 10 秒！"), { color: "#ffd23f", sub: T("Star shower!", "星星雨！") });
      this.sound("bell");
      music.speed(1.18);
    }
    // stars pop up
    const alive = this.items.filter((it) => !it.dead && it.value === 1).length;
    this.nextStar -= dt;
    if (this.nextStar <= 0 && alive < MAX_STARS + (this.hurry ? 2 : 0)) {
      this.spawnStar(1);
      this.nextStar = (this.hurry ? 0.5 : 0.9) + this.rnd() * 0.8;
    }
    this.nextBig -= dt;
    if (this.nextBig <= 0) {
      if (!this.items.some((it) => !it.dead && it.value >= 3)) this.spawnStar(3);
      this.nextBig = 8 + this.rnd() * 4;
    }
    this.moveSkaters(dt, true);
    this.updateStars(dt, true);
    this.placeSkaters(dt);
    if (left <= 0) this.finishByScore(this.sk.map((s) => s.stars));
  }

  protected outroStep(dt: number) {
    this.snow(dt);
    this.moveSkaters(dt, false);
    this.updateStars(dt, false);
    this.placeSkaters(dt);
  }

  protected celebrate(res: MiniResult) {
    this.avatars.forEach((a, i) => {
      a.anim = res.place[i] === 1 ? "win" : "lose";
      a.root.rotation.z = 0;
      if (res.place[i] === 1) this.fx.confetti({ x: this.sk[i].x, y: 3, z: this.sk[i].z }, 60);
    });
  }

  private snow(dt: number) {
    const now = performance.now() / 1000;
    this.flakeP.forEach((p, k) => {
      p.y -= dt * (0.8 + p.s * 8);
      if (p.y < 0) p.y += 14;
      this.m4.makeScale(p.s, p.s, p.s);
      this.m4.setPosition(p.x + Math.sin(now * 0.8 + p.ph) * 0.6, p.y, p.z);
      this.flakes.setMatrixAt(k, this.m4);
    });
    this.flakes.instanceMatrix.needsUpdate = true;
  }

  private moveSkaters(dt: number, live: boolean) {
    this.sk.forEach((s, i) => {
      const a = this.avatars[i];
      const p = live ? this.pad(i) : { x: 0, y: 0, aDown: false };
      s.shoveCd -= dt;
      s.safe -= dt;
      s.phase += dt * (2 + Math.hypot(s.vx, s.vz) * 0.5);
      if (s.stun > 0) {
        s.stun -= dt;
        s.spin += dt * 16 * Math.max(0.3, s.stun / STUN);
        if (s.stun <= 0) s.safe = 0.6;
      } else if (s.shoveT > 0) {
        s.shoveT -= dt;
      } else {
        s.vx += p.x * ACC * dt;
        s.vz += p.y * ACC * dt;
        if (live && p.aDown && s.shoveCd <= 0) {
          const l = Math.hypot(p.x, p.y);
          const yaw = l > 0.25 ? Math.atan2(p.x, p.y) : a.yaw;
          s.vx = s.vx * 0.3 + Math.sin(yaw) * SHOVE_V;
          s.vz = s.vz * 0.3 + Math.cos(yaw) * SHOVE_V;
          s.shoveT = SHOVE_T;
          s.shoveCd = SHOVE_CD;
          a.yaw = yaw;
          this.sound("whoosh");
          this.fx.burst({ x: s.x, y: 0.1, z: s.z }, { count: 8, colors: ["#ffffff", "#d8f2ff"], speed: 2.5, up: 1, gravity: 6, size: 0.12, life: 0.4 });
        }
      }
      // low friction
      const drag = s.stun > 0 ? 1.2 : DRAG;
      s.vx *= Math.exp(-drag * dt);
      s.vz *= Math.exp(-drag * dt);
      const v = Math.hypot(s.vx, s.vz);
      const cap = s.shoveT > 0 ? SHOVE_V + 2 : VMAX;
      if (v > cap) {
        s.vx *= cap / v;
        s.vz *= cap / v;
      }
      s.x += s.vx * dt;
      s.z += s.vz * dt;
      // the snow banks: bounce back
      const ex = s.x / (RX - PR),
        ez = s.z / (RZ - PR);
      const e = Math.hypot(ex, ez);
      if (e > 1) {
        s.x /= e;
        s.z /= e;
        // normal of the ellipse
        let nx = s.x / ((RX - PR) * (RX - PR)),
          nz = s.z / ((RZ - PR) * (RZ - PR));
        const nl = Math.hypot(nx, nz) || 1;
        nx /= nl;
        nz /= nl;
        const vn = s.vx * nx + s.vz * nz;
        if (vn > 0) {
          s.vx -= 1.6 * vn * nx;
          s.vz -= 1.6 * vn * nz;
          if (vn > 3) {
            this.fx.burst({ x: s.x + nx * 0.5, y: 0.4, z: s.z + nz * 0.5 }, { count: 10, colors: ["#ffffff", "#e8f0ff"], speed: 3, up: 2, gravity: 9, size: 0.16, life: 0.5 });
            this.sound("land");
          }
        }
      }
      // skate spray at speed
      if (v > 5 && Math.random() < 0.3) this.fx.dust({ x: s.x, y: 0, z: s.z }, 1, "#ffffff");
    });
    // collisions (a shove sends the other one spinning)
    for (let i = 0; i < this.sk.length; i++)
      for (let j = i + 1; j < this.sk.length; j++) {
        const A = this.sk[i],
          B = this.sk[j];
        const dx = B.x - A.x,
          dz = B.z - A.z;
        const d = Math.hypot(dx, dz);
        if (d >= PR * 2 || d < 1e-4) continue;
        const nx = dx / d,
          nz = dz / d;
        const pen = PR * 2 - d;
        A.x -= nx * pen * 0.5;
        A.z -= nz * pen * 0.5;
        B.x += nx * pen * 0.5;
        B.z += nz * pen * 0.5;
        const vn = (A.vx - B.vx) * nx + (A.vz - B.vz) * nz;
        if (vn > 0) {
          const jj = vn * 0.9;
          A.vx -= nx * jj;
          A.vz -= nz * jj;
          B.vx += nx * jj;
          B.vz += nz * jj;
        }
        for (const [att, vic, vi, ai] of [
          [A, B, j, i],
          [B, A, i, j],
        ] as const) {
          if (att.shoveT > 0 && vic.stun <= 0 && vic.safe <= 0) {
            const sgn = att === A ? 1 : -1;
            vic.vx = nx * sgn * 7.5 + att.vx * 0.3;
            vic.vz = nz * sgn * 7.5 + att.vz * 0.3;
            att.vx *= 0.25;
            att.vz *= 0.25;
            att.shoveT = 0;
            vic.stun = STUN;
            this.avatars[vi].flash();
            this.sound("hit");
            this.sound("slide");
            this.shake = Math.max(this.shake, 0.25);
            this.fx.burst({ x: (A.x + B.x) / 2, y: 1, z: (A.z + B.z) / 2 }, { count: 14, colors: ["#ffffff", "#ffe14a", "#9fdcff"], speed: 5, size: 0.16, life: 0.45 });
            this.buzz(vi, [70, 30, 70]);
            this.buzz(ai, 30);
          }
        }
        if (vn > 2.5) this.sound("bonk");
      }
  }

  private updateStars(dt: number, live: boolean) {
    const now = performance.now() / 1000;
    for (const it of this.items) {
      if (it.dead) continue;
      it.age += dt;
      const big = it.value >= 3;
      const pop = Math.min(1, it.age / 0.35);
      const sc = pop < 1 ? 1.25 * Math.sin(pop * Math.PI * 0.62) / Math.sin(Math.PI * 0.62) : 1;
      it.g.scale.setScalar(Math.max(0.01, sc));
      it.g.position.y = (big ? 1.15 : 0.85) + Math.sin(now * 3 + it.x) * 0.12;
      it.g.rotation.y = Math.sin(now * 2.4 + it.x) * 0.55;
      it.g.getObjectByName("star")!.rotation.z += dt * (big ? 1.5 : 2.2);
      const halo = it.g.getObjectByName("halo");
      if (halo) halo.scale.setScalar(1.05 + Math.sin(now * 6) * 0.12);
      if (it.age > it.life - 2) it.g.visible = Math.floor(it.age * 10) % 2 === 0;
      if (it.age > it.life) {
        this.fx.sparkle({ x: it.x, y: 0.9, z: it.z }, "#fff6a8", 6);
        this.removeStar(it);
        continue;
      }
      if (big && Math.random() < 0.3) this.fx.sparkle({ x: it.x, y: 1.2, z: it.z }, "#ffe14a", 1);
      if (!live || it.age < 0.2) continue;
      for (let i = 0; i < this.sk.length; i++) {
        const s = this.sk[i];
        if (dist2(s.x, s.z, it.x, it.z) < PR + (big ? 0.75 : 0.5)) {
          s.stars += it.value;
          this.hud.setScore(this.players[i].seat, `${STAR} ${s.stars}`);
          this.hud.pop(new THREE.Vector3(it.x, 2.2, it.z), `+${it.value}`, big ? "#ffd23f" : "#fff6a8", this.camera);
          this.fx.sparkle({ x: it.x, y: 1, z: it.z }, "#ffe14a", big ? 30 : 12);
          if (big) {
            this.fx.ring({ x: it.x, y: 0.05, z: it.z }, "#ffd23f", 2.6, 0.5);
            this.sound("star");
            this.buzz(i, [40, 30, 40]);
          } else {
            this.sound("coin");
            this.buzz(i, 25);
          }
          this.removeStar(it);
          break;
        }
      }
    }
    this.items = this.items.filter((it) => !it.dead);
  }

  private placeSkaters(dt: number) {
    this.sk.forEach((s, i) => {
      const a = this.avatars[i];
      const v = Math.hypot(s.vx, s.vz);
      const p = this.finished ? { x: 0, y: 0 } : this.pad(i);
      const pushing = Math.hypot(p.x, p.y) > 0.3;
      if (s.stun > 0 && !this.finished) {
        a.anim = "stun";
        a.yaw = s.spin;
        a.root.rotation.z = 0;
      } else if (!this.finished) {
        if (s.shoveT > 0) a.anim = "push";
        else if (pushing) {
          // skating strides with a side-to-side sway
          a.anim = "run";
          a.speed = 0.25 + 0.25 * clamp(v / VMAX, 0, 1);
          a.root.rotation.z = Math.sin(s.phase * 2.2) * 0.16;
        } else {
          // gliding
          a.anim = v > 1 ? "jump" : "idle";
          a.root.rotation.z *= Math.exp(-6 * dt);
        }
        const face = pushing ? Math.atan2(p.x, p.y) : v > 0.6 ? Math.atan2(s.vx, s.vz) : a.yaw;
        if (s.shoveT <= 0 && Math.abs(angDiff(a.yaw, face)) > 0.01) a.face(face, dt, 9);
      }
      // lean into the glide
      a.root.rotation.x = s.stun > 0 || this.finished ? 0 : clamp(v / VMAX, 0, 1) * 0.18;
      a.pos.set(s.x, 0, s.z);
    });
  }

  dispose() {
    for (const m of this.baked) m.dispose();
    this.starGeoS.dispose();
    this.starGeoB.dispose();
    super.dispose();
  }
}

const def: MiniDef = {
  id: "patinoire",
  name: "Star Rink",
  icon: "⛸️",
  color: "#7fd8ff",
  tagline: "Slide on the ice and catch the stars.",
  rules: "The ice slides: build speed and catch the stars (the big gold one is 3). A: a shove that sends a rival spinning! Most stars wins.",
  controls: { stick: "Skate", a: "Shove" },
  modes: ["ffa"],
  length: 40,
  music: "mini3",
  create: (ctx) => new Patinoire(ctx),
};
export default def;
