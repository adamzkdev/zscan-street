/**
 * CHARS D'ASSAUT (chacun pour soi, 60 s max): toy tanks on a playroom floor, between walls of wooden
 * blocks and crates. The stick drives (the tank turns toward it, then rolls), A fires a shell that
 * bounces once off walls (2 shells in flight at most). 3 lives each, a short invulnerability after a
 * hit. Last tank rolling wins; at 60 s: most lives, then most hits.
 */
import * as THREE from "three";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef, MiniResult } from "../types";
import { GEO, ball, box, canvasTex, cone, cyl, flat, group, toon } from "../../engine/gfx";
import { angDiff, clamp, dist2 } from "../../engine/util";
import { music } from "../../engine/audio";
import { T } from "../../../../i18n/lang";

/** 2 → "2nd" (English) or "第 2 名". */
const ordinal = (n: number) => T(`${n}<sup>${["st", "nd", "rd"][n - 1] ?? "th"}</sup>`, `第 ${n} 名`);

const TIME = 60;
const HX = 10.4;
const HZ = 6.4;
const TR = 0.72; // tank radius
const HIT_R = 0.6; // what a shell must touch
const SPEED = 4.4;
const TURN = 4.6; // rad/s
const SHELL_V = 7.4;
const SHELL_R = 0.16;
const MAX_SHELLS = 2;
const FIRE_CD = 0.4;
const LIVES = 3;
const INVUL = 2.0;
const BLOCK = 0.9;

interface Box {
  x: number;
  z: number;
  hw: number;
  hd: number;
}
interface Tank {
  x: number;
  z: number;
  yaw: number;
  v: number;
  lives: number;
  kills: number;
  invul: number;
  cd: number;
  recoil: number;
  alive: boolean;
  g: THREE.Group;
  body: THREE.Group;
  bodyMat: THREE.MeshToonMaterial;
  flash: THREE.Mesh;
  treadPh: number;
  treadL: THREE.Mesh;
  treadR: THREE.Mesh;
  /** The rider's flight when the tank blows up. */
  eject: { t: number; vx: number; vy: number; vz: number; y: number } | null;
}
interface Shell {
  m: THREE.Mesh;
  x: number;
  z: number;
  vx: number;
  vz: number;
  owner: number;
  bounces: number;
  age: number;
  dead: boolean;
}
interface CpuMem {
  aimYaw: number | null;
  plan: number;
  roam: number;
  dodgeT: number;
  dodgeYaw: number;
  /** Aim error for the current shot, and when the CPU may shoot again. */
  err: number;
  nextShot: number;
}

class Chars extends BaseMini {
  private tanks: Tank[] = [];
  private shells: Shell[] = [];
  private boxes: Box[] = [];
  private out: number[] = [];
  private mem: CpuMem[] = [];
  private hurry = false;
  private ended = false;
  private shellGeo = new THREE.CapsuleGeometry(SHELL_R, 0.22, 4, 8);

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#f6e6d0", "#fff6e8"], size: 13, sun: [-0.4, 1, 0.5], sunIntensity: 2.4, hemi: ["#fff4e0", "#a08060", 1.5], fog: { color: "#f3e2c8", near: 40, far: 90 } });
    this.buildRoom();
    const starts: [number, number][] = [
      [-8.8, -4.8],
      [8.8, -4.8],
      [-8.8, 4.8],
      [8.8, 4.8],
    ];
    this.players.forEach((_, i) => {
      const [x, z] = starts[i];
      const yaw = Math.atan2(-x, -z * 0.3);
      this.tanks.push(this.makeTank(i, x, z, yaw));
      const a = this.spawn(i, x, z, yaw, { scale: 0.55, blob: false });
      a.anim = "idle";
      this.mem.push({ aimYaw: null, plan: 0, roam: 0, dodgeT: 0, dodgeYaw: 0, err: 0, nextShot: 1 + Math.random() });
    });
    this.hud.players(this.players, () => this.cardHtml(LIVES, 0));
    this.hud.timer(TIME);
    this.setCam([0, 30, 24], [0, 0, 0.8], 44);
    this.placeTanks(0);
  }

  private cardHtml(lives: number, kills: number) {
    let h = "";
    for (let k = 0; k < LIVES; k++) h += `<span style="color:${k < lives ? "#ff4b5e" : "rgba(255,255,255,0.25)"};margin-right:0.05em">♥</span>`;
    return `${h}<span style="font-size:0.5em;opacity:0.85;margin-left:0.3em">💥${kills}</span>`;
  }

  // ------------------------------------------------------------ the playroom

  private buildRoom() {
    const s = this.scene;
    const wood = canvasTex(
      512,
      512,
      (g, w) => {
        const cols = ["#d9a46a", "#cf9a5e", "#e0ad74", "#c99358"];
        for (let k = 0; k < 8; k++) {
          g.fillStyle = cols[k % 4];
          g.fillRect(0, (k / 8) * w, w, w / 8);
          g.fillStyle = "rgba(90,50,20,0.35)";
          g.fillRect(0, (k / 8) * w, w, 3);
          g.fillRect(((k * 173) % w) + 0, (k / 8) * w, 3, w / 8);
          g.strokeStyle = "rgba(120,70,30,0.15)";
          g.lineWidth = 2;
          for (let j = 0; j < 5; j++) {
            g.beginPath();
            const y = (k / 8) * w + 8 + j * 11;
            g.moveTo(0, y);
            g.bezierCurveTo(w * 0.3, y + 4, w * 0.6, y - 4, w, y + 2);
            g.stroke();
          }
        }
      },
      true,
    );
    wood.repeat.set(6, 6);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), new THREE.MeshToonMaterial({ map: wood }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);
    // a play rug under the arena (roads printed on it)
    const rugTex = canvasTex(1024, 640, (g, w, h) => {
      g.fillStyle = "#5fb86a";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#4ea85a";
      for (let k = 0; k < 40; k++) g.fillRect((k * 197) % w, (k * 113) % h, 30, 30);
      g.strokeStyle = "#6a6a78";
      g.lineWidth = 46;
      g.strokeRect(120, 100, w - 240, h - 200);
      g.beginPath();
      g.moveTo(w / 2, 100);
      g.lineTo(w / 2, h - 100);
      g.stroke();
      g.setLineDash([24, 22]);
      g.strokeStyle = "#ffffff";
      g.lineWidth = 5;
      g.strokeRect(120, 100, w - 240, h - 200);
      g.beginPath();
      g.moveTo(w / 2, 100);
      g.lineTo(w / 2, h - 100);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = "#4fa8e8";
      g.beginPath();
      g.ellipse(w * 0.25, h * 0.5, 70, 46, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#ffffff";
      g.lineWidth = 16;
      g.strokeStyle = "#ffffff";
      g.strokeRect(8, 8, w - 16, h - 16);
    });
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2 + 1.2, HZ * 2 + 1.2), new THREE.MeshToonMaterial({ map: rugTex }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.y = 0.02;
    rug.receiveShadow = true;
    s.add(rug);
    // alphabet blocks: one material per colour, each with its own letter
    const blockCols = ["#ff5a4e", "#ffc928", "#3fa8ff", "#4fcf6a", "#b06aff"];
    const letters = ["Z", "E", "C", "1", "2"];
    const blockMats = blockCols.map((c, k) => {
      const tex = canvasTex(128, 128, (g, w) => {
        g.fillStyle = "#ffffff";
        g.fillRect(0, 0, w, w);
        g.strokeStyle = "rgba(0,0,0,0.18)";
        g.lineWidth = 10;
        g.strokeRect(10, 10, w - 20, w - 20);
        g.font = `bold 80px "Lilita One", sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillStyle = "rgba(255,255,255,0.95)";
        g.fillText(letters[k], w / 2, w / 2 + 6);
        g.strokeStyle = "rgba(0,0,0,0.25)";
        g.lineWidth = 3;
        g.strokeText(letters[k], w / 2, w / 2 + 6);
      });
      return new THREE.MeshToonMaterial({ color: c, map: tex });
    });
    // blocks are gathered per colour, then drawn as one instanced mesh per colour
    let bk = 0;
    const placed: THREE.Matrix4[][] = blockMats.map(() => []);
    const block = (x: number, z: number, y = BLOCK / 2, ry = 0) => {
      const m4 = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(BLOCK, BLOCK, BLOCK));
      placed[bk++ % blockMats.length].push(m4);
    };
    // the border: a fence of blocks
    for (let x = -HX - BLOCK / 2; x <= HX + BLOCK / 2 + 0.01; x += BLOCK) {
      block(x, -HZ - BLOCK / 2);
      block(x, HZ + BLOCK / 2);
    }
    for (let z = -HZ + BLOCK / 2; z <= HZ - BLOCK / 2 + 0.01; z += BLOCK) {
      block(-HX - BLOCK / 2, z);
      block(HX + BLOCK / 2, z);
    }
    // inner walls of blocks (point-symmetric layout)
    const row = (x: number, z: number, n: number, vertical: boolean) => {
      const len = n * BLOCK;
      for (let k = 0; k < n; k++) {
        const o = (k + 0.5) * BLOCK - len / 2;
        block(vertical ? x : x + o, vertical ? z + o : z);
      }
      // a second layer on the middle blocks for a toy look
      if (n >= 3) block(x, z, BLOCK * 1.5, 0.3);
      this.boxes.push({ x, z, hw: vertical ? BLOCK / 2 : len / 2, hd: vertical ? len / 2 : BLOCK / 2 });
    };
    row(-4.6, -1.6, 4, true);
    row(4.6, 1.6, 4, true);
    row(-1.3, 3.9, 3, false);
    row(1.3, -3.9, 3, false);
    // wooden crates
    const crateTex = canvasTex(128, 128, (g, w) => {
      g.fillStyle = "#c48a4a";
      g.fillRect(0, 0, w, w);
      g.fillStyle = "#a8703a";
      for (let k = 0; k < 4; k++) g.fillRect(0, k * 32 + 28, w, 4);
      g.strokeStyle = "#7a4a22";
      g.lineWidth = 12;
      g.strokeRect(6, 6, w - 12, w - 12);
      g.beginPath();
      g.moveTo(10, 10);
      g.lineTo(w - 10, w - 10);
      g.stroke();
    });
    const crateMat = new THREE.MeshToonMaterial({ map: crateTex });
    const crate = (x: number, z: number, sz: number) => {
      const m = new THREE.Mesh(GEO.box, crateMat);
      m.scale.setScalar(sz);
      m.position.set(x, sz / 2, z);
      m.castShadow = m.receiveShadow = true;
      s.add(m);
      this.boxes.push({ x, z, hw: sz / 2, hd: sz / 2 });
    };
    crate(-7.2, 1.4, 1.2);
    crate(7.2, -1.4, 1.2);
    crate(0, 0, 1.3);
    crate(-1.6, -1.2, 0.9);
    crate(1.6, 1.2, 0.9);
    placed.forEach((list, k) => {
      const im = new THREE.InstancedMesh(GEO.box, blockMats[k], list.length);
      list.forEach((m4, j) => im.setMatrixAt(j, m4));
      im.castShadow = im.receiveShadow = true;
      s.add(im);
    });
    // giant toys around the arena
    const crayon = (x: number, z: number, ry: number, c: string) => {
      const g = group(s, { x, y: 0.45, z, ry });
      cyl(g, c, 0.45, 6, { rz: Math.PI / 2, seg: 8 });
      cyl(g, "#ffffff", 0.47, 2.2, { rz: Math.PI / 2, seg: 8 });
      cone(g, "#e8c090", 0.45, 1.1, { x: 3.55, rz: -Math.PI / 2, lo: true });
      cone(g, c, 0.16, 0.4, { x: 3.95, rz: -Math.PI / 2, lo: true });
    };
    crayon(-3, -10.2, 0.15, "#ff4b3e");
    crayon(4, 9.6, -0.2, "#2f8dff");
    crayon(15.2, -3, 1.7, "#3fcf5a");
    // a teddy bear
    const ted = group(s, { x: -15, z: -5.5, ry: 0.7 });
    const fur = "#b8763a";
    ball(ted, fur, [1.5, 1.7, 1.3], { y: 1.6 });
    ball(ted, "#e8c090", [0.9, 1.0, 0.5], { y: 1.5, z: 0.95 });
    ball(ted, fur, 1.15, { y: 3.8 });
    ball(ted, "#e8c090", 0.5, { y: 3.6, z: 1.0 });
    ball(ted, "#2a1a12", 0.15, { y: 3.85, z: 1.45 });
    for (const sx of [-1, 1]) {
      ball(ted, fur, 0.45, { x: sx * 0.9, y: 4.7 });
      ball(ted, "#1d1630", 0.13, { x: sx * 0.4, y: 4.15, z: 0.98 });
      ball(ted, fur, [0.5, 0.5, 0.9], { x: sx * 1.4, y: 2.2, z: 0.5 });
      ball(ted, fur, [0.6, 0.55, 0.9], { x: sx * 0.8, y: 0.5, z: 0.9 });
    }
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.15, 6, 12), toon("#ff4b8b"));
    bow.position.set(0, 2.95, 0.7);
    ted.add(bow);
    // a stack of books
    const books = group(s, { x: 15.5, z: 6, ry: -0.4 });
    ["#2f6ad0", "#e8a020", "#c83a3a", "#3a9a5a"].forEach((c, k) => box(books, c, 3.2 - k * 0.2, 0.6, 2.2 - k * 0.1, { y: 0.3 + k * 0.6, ry: k * 0.12 }));
    // a beach ball and a spinning top
    const bb = group(s, { x: -14, z: 7, ry: 0.5 });
    const cols = ["#ff4b3e", "#ffffff", "#ffd23f", "#ffffff", "#2f8dff", "#ffffff"];
    cols.forEach((c, k) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 12, (k / 6) * Math.PI * 2, Math.PI / 3), toon(c));
      m.position.y = 1.6;
      m.castShadow = true;
      bb.add(m);
    });
    const top = group(s, { x: 12, z: -9.5 });
    cone(top, "#9b5cff", 1, 1.2, { y: 0.9, rx: Math.PI });
    cyl(top, "#ffd23f", 1.05, 0.25, { y: 1.5 });
    cyl(top, "#9b5cff", 0.15, 0.8, { y: 1.9 });
    // the room walls (back and left) with wallpaper and a skirting board
    const paper = canvasTex(
      256,
      256,
      (g, w) => {
        g.fillStyle = "#bfe3f2";
        g.fillRect(0, 0, w, w);
        g.fillStyle = "#a8d4e8";
        for (let k = 0; k < 4; k++) g.fillRect(k * 64, 0, 32, w);
        g.fillStyle = "#ffffff";
        for (let k = 0; k < 6; k++) {
          g.beginPath();
          g.arc((k * 97) % w, (k * 61) % w, 8, 0, Math.PI * 2);
          g.fill();
        }
      },
      true,
    );
    paper.repeat.set(10, 3);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(70, 20), new THREE.MeshToonMaterial({ map: paper }));
    wall.position.set(0, 10, -16);
    s.add(wall);
    box(s, "#ffffff", 70, 0.8, 0.3, { z: -15.85, y: 0.4 });
  }

  private makeTank(i: number, x: number, z: number, yaw: number): Tank {
    const p = this.players[i];
    const g = group(this.scene, { x, z });
    const body = group(g);
    const bodyMat = new THREE.MeshToonMaterial({ color: p.char.color, emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0 });
    const dark = new THREE.Color(p.char.color).multiplyScalar(0.6);
    // hull
    const hull = new THREE.Mesh(GEO.box, bodyMat);
    hull.scale.set(1.05, 0.42, 1.45);
    hull.position.y = 0.42;
    hull.castShadow = true;
    body.add(hull);
    box(body, toon(dark), 1.1, 0.1, 1.5, { y: 0.66 });
    // treads
    const treadMat = toon("#3a3a44");
    const treadL = box(body, treadMat, 0.32, 0.42, 1.6, { x: -0.62, y: 0.24 });
    const treadR = box(body, treadMat, 0.32, 0.42, 1.6, { x: 0.62, y: 0.24 });
    for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) cyl(body, "#8a8a9a", 0.13, 0.36, { x: sx * 0.62, y: 0.2, z: -0.54 + k * 0.36, rz: Math.PI / 2, seg: 10 });
    // turret + barrel
    const tur = new THREE.Mesh(GEO.cyl, bodyMat);
    tur.scale.set(0.46, 0.3, 0.46);
    tur.position.y = 0.82;
    tur.castShadow = true;
    body.add(tur);
    cyl(body, toon(dark), 0.1, 1.0, { y: 0.82, z: 0.7, rx: Math.PI / 2, seg: 10 });
    cyl(body, "#3a3a44", 0.13, 0.18, { y: 0.82, z: 1.2, rx: Math.PI / 2, seg: 10 });
    // little star on the side
    const star = new THREE.Mesh(GEO.circle, flat("#ffffff"));
    star.scale.setScalar(0.14);
    star.position.set(0.53, 0.45, 0.2);
    star.rotation.y = Math.PI / 2;
    body.add(star);
    const flash = ball(body, flat("#ffd23f", 0.95, true), 0.3, { y: 0.82, z: 1.45, cast: false });
    flash.visible = false;
    return { x, z, yaw, v: 0, lives: LIVES, kills: 0, invul: 0, cd: 0, recoil: 0, alive: true, g, body, bodyMat, flash, treadPh: 0, treadL, treadR, eject: null };
  }

  // ------------------------------------------------------------ geometry helpers

  private hitBox(x: number, z: number, r: number): Box | null {
    for (const b of this.boxes) if (Math.abs(x - b.x) < b.hw + r && Math.abs(z - b.z) < b.hd + r) return b;
    return null;
  }
  private outside(x: number, z: number, r: number) {
    return Math.abs(x) > HX - r || Math.abs(z) > HZ - r;
  }

  /**
   * Where would a shell fired from (x, z) along yaw go? Returns the first tank it would hit (or -1),
   * and whether it would hit its owner first.
   */
  private simShot(owner: number, x: number, z: number, yaw: number, maxLen = 26): { hit: number; self: boolean } {
    let vx = Math.sin(yaw),
      vz = Math.cos(yaw);
    let bounces = 0;
    const stepL = 0.2;
    for (let d = 0; d < maxLen; d += stepL) {
      const nx = x + vx * stepL,
        nz = z + vz * stepL;
      const b = this.hitBox(nx, nz, SHELL_R);
      const out = this.outside(nx, nz, SHELL_R);
      if (b || out) {
        if (bounces >= 1) return { hit: -1, self: false };
        bounces++;
        if (out) {
          if (Math.abs(nx) > HX - SHELL_R) vx = -vx;
          if (Math.abs(nz) > HZ - SHELL_R) vz = -vz;
        } else if (b) {
          const inX = Math.abs(x - b.x) < b.hw + SHELL_R;
          if (inX) vz = -vz;
          else vx = -vx;
        }
        continue;
      }
      x = nx;
      z = nz;
      for (let j = 0; j < this.tanks.length; j++) {
        const t = this.tanks[j];
        if (!t.alive) continue;
        if (j === owner && bounces === 0) continue;
        if (dist2(x, z, t.x, t.z) < HIT_R + SHELL_R) return { hit: j, self: j === owner };
      }
    }
    return { hit: -1, self: false };
  }

  // ------------------------------------------------------------ CPUs

  protected cpu(i: number, dt: number): CpuPad {
    const me = this.tanks[i];
    const m = this.mem[i];
    if (!me.alive) return {};
    const lv = this.players[i].level;
    // dodge shells heading my way (turn to the side closest to my heading and roll)
    if (m.dodgeT > this.t) return this.drive(me, m.dodgeYaw, 1);
    for (const s of this.shells) {
      if (s.dead || (s.owner === i && s.bounces === 0)) continue;
      const rx = me.x - s.x,
        rz = me.z - s.z;
      const v2 = s.vx * s.vx + s.vz * s.vz;
      const tca = (rx * s.vx + rz * s.vz) / v2;
      if (tca < 0 || tca > 0.9) continue;
      const mx = s.x + s.vx * tca - me.x,
        mz = s.z + s.vz * tca - me.z;
      if (Math.hypot(mx, mz) > TR + 0.35) continue;
      if (Math.random() < (0.04 + 0.12 * lv) * 60 * dt) {
        const base = Math.atan2(-s.vz, s.vx);
        const y1 = base,
          y2 = base + Math.PI;
        let y = Math.abs(angDiff(me.yaw, y1)) < Math.abs(angDiff(me.yaw, y2)) ? y1 : y2;
        // if that side is blocked, take the other
        if (this.hitBox(me.x + Math.sin(y) * 1.5, me.z + Math.cos(y) * 1.5, TR) || this.outside(me.x + Math.sin(y) * 1.5, me.z + Math.cos(y) * 1.5, TR)) y += Math.PI;
        m.dodgeT = this.t + 0.45;
        m.dodgeYaw = y;
        return this.drive(me, y, 1);
      }
    }
    // the nearest rival: keep a fighting distance (point-blank duels end everything too fast)
    let tg = -1,
      td = 1e9;
    this.tanks.forEach((t, j) => {
      if (j === i || !t.alive) return;
      const d = dist2(me.x, me.z, t.x, t.z);
      if (d < td) {
        td = d;
        tg = j;
      }
    });
    if (tg < 0) return {};
    const near = this.tanks[tg];
    if (td < 4.2 + lv) {
      m.aimYaw = null;
      const a = Math.atan2(me.x - near.x, me.z - near.z) + (i % 2 ? 0.5 : -0.5);
      return this.drive(me, this.avoid(me, a), 1);
    }
    // look for a shot now and then: direct for everyone, off a wall for the better ones
    m.plan -= dt;
    if (m.plan <= 0) {
      m.plan = 0.25 + (1 - lv) * 0.35;
      m.aimYaw = null;
      let best = 1e9;
      const n = 48;
      for (let k = 0; k < n; k++) {
        const yaw = (k / n) * Math.PI * 2;
        const r = this.simShot(i, me.x + Math.sin(yaw) * 1.2, me.z + Math.cos(yaw) * 1.2, yaw);
        if (r.hit < 0 || r.self) continue;
        const t = this.tanks[r.hit];
        if (dist2(me.x, me.z, t.x, t.z) < 3) continue;
        const direct = !this.losBlocked(me.x, me.z, t.x, t.z) && Math.abs(angDiff(yaw, Math.atan2(t.x - me.x, t.z - me.z))) < 0.3;
        if (!direct && lv < 0.45) continue;
        const cost = Math.abs(angDiff(me.yaw, yaw)) + (direct ? 0 : 0.6) + (t.invul > 0 ? 2 : 0);
        if (cost < best) {
          best = cost;
          m.aimYaw = yaw;
        }
      }
    }
    if (m.aimYaw !== null) {
      // refine toward the exact direct line when it is one
      const want = m.aimYaw + m.err;
      const diff = angDiff(me.yaw, want);
      if (Math.abs(diff) < 0.05) {
        const live = this.shells.filter((s) => !s.dead && s.owner === i).length;
        if (me.cd <= 0 && this.t >= m.nextShot && live < MAX_SHELLS && this.cpuAfter(i, "fire", 0.45 - 0.3 * lv)) {
          const r = this.simShot(i, me.x + Math.sin(me.yaw) * 1.2, me.z + Math.cos(me.yaw) * 1.2, me.yaw);
          if (!r.self) {
            this.cpuReset(i, "fire");
            m.plan = 0;
            m.nextShot = this.t + 1.8 + (1 - lv) * 1.6 + Math.random() * 1.4;
            // the next shot gets its own aiming error (bigger for beginners)
            m.err = (Math.random() - 0.5) * 2 * (0.07 + 0.26 * (1 - lv));
            return { x: Math.sin(want) * 0.2, y: Math.cos(want) * 0.2, a: true };
          }
          m.aimYaw = null;
        }
      }
      return { x: Math.sin(want) * 0.22, y: Math.cos(want) * 0.22 };
    }
    // no shot: close in on the nearest rival up to a fighting distance, then circle around it
    m.roam -= dt;
    const toward = Math.atan2(near.x - me.x, near.z - me.z);
    let want = toward;
    if (td < 8) want = toward + (i % 2 ? 1 : -1) * (Math.PI / 2 - 0.3);
    return this.drive(me, this.avoid(me, want), td < 8 ? 0.7 : 1);
  }

  private losBlocked(ax: number, az: number, bx: number, bz: number) {
    const d = dist2(ax, az, bx, bz);
    const n = Math.ceil(d / 0.3);
    for (let k = 1; k < n; k++) {
      const t = k / n;
      if (this.hitBox(ax + (bx - ax) * t, az + (bz - az) * t, SHELL_R)) return true;
    }
    return false;
  }

  /** Bend a wished heading so we don't drive into a wall (feelers). */
  private avoid(me: Tank, yaw: number) {
    const free = (y: number) => {
      for (const l of [0.9, 1.6]) {
        const x = me.x + Math.sin(y) * l,
          z = me.z + Math.cos(y) * l;
        if (this.hitBox(x, z, TR * 0.9) || this.outside(x, z, TR)) return false;
      }
      return true;
    };
    if (free(yaw)) return yaw;
    for (const d of [0.5, -0.5, 1.0, -1.0, 1.5, -1.5, 2.2, -2.2]) if (free(yaw + d)) return yaw + d;
    return yaw + Math.PI;
  }

  private drive(_me: Tank, yaw: number, mag: number): CpuPad {
    return { x: Math.sin(yaw) * mag, y: Math.cos(yaw) * mag };
  }

  // ------------------------------------------------------------ the game

  protected idle(dt: number) {
    this.moveCam([0, 17, 13.5], [0, 0, 0.7], dt, 1.6);
    this.placeTanks(dt);
  }

  protected step(dt: number) {
    const left = TIME - this.t;
    this.hud.timer(left);
    this.moveCam([0, 17, 13.5], [0, 0, 0.7], dt, 3);
    if (!this.hurry && left <= 10) {
      this.hurry = true;
      this.hud.banner(T("10 seconds left!", "还剩 10 秒！"), { color: "#ffd23f" });
      this.sound("bell");
      music.speed(1.18);
    }
    this.tanks.forEach((t, i) => this.driveTank(t, i, dt));
    this.collideTanks();
    this.updateShells(dt);
    this.placeTanks(dt);
    const alive = this.tanks.filter((t) => t.alive).length;
    if (!this.ended && (alive <= 1 || left <= 0)) {
      this.ended = true;
      // eliminated: by how long they lasted; survivors: lives, then hits
      const scores = this.tanks.map((t, i) => (t.alive ? 1000 + t.lives * 100 + t.kills : this.out.indexOf(i)));
      this.finishByScore(scores);
    }
  }

  protected outroStep(dt: number) {
    this.updateShells(dt);
    this.placeTanks(dt);
  }

  protected celebrate(res: MiniResult) {
    this.avatars.forEach((a, i) => {
      const t = this.tanks[i];
      if (t.alive) {
        a.anim = res.place[i] === 1 ? "win" : "idle";
        if (res.place[i] === 1) this.fx.confetti({ x: t.x, y: 3, z: t.z }, 60);
      } else a.anim = "lose";
    });
  }

  private driveTank(t: Tank, i: number, dt: number) {
    t.cd -= dt;
    t.invul -= dt;
    t.recoil = Math.max(0, t.recoil - dt * 4);
    if (!t.alive) return;
    const p = this.pad(i);
    const mag = Math.hypot(p.x, p.y);
    let target = 0;
    if (mag > 0.15) {
      const want = Math.atan2(p.x, p.y);
      const d = angDiff(t.yaw, want);
      const step = TURN * dt;
      t.yaw += Math.abs(d) < step ? d : Math.sign(d) * step;
      // roll once roughly facing the stick
      const k = clamp(1 - Math.abs(angDiff(t.yaw, want)) / 1.0, 0, 1);
      target = SPEED * Math.min(1, mag) * k;
    }
    t.v += (target - t.v) * (1 - Math.exp(-8 * dt));
    const nx = t.x + Math.sin(t.yaw) * t.v * dt,
      nz = t.z + Math.cos(t.yaw) * t.v * dt;
    t.x = nx;
    t.z = nz;
    // walls
    t.x = clamp(t.x, -HX + TR, HX - TR);
    t.z = clamp(t.z, -HZ + TR, HZ - TR);
    for (const b of this.boxes) {
      const cx = clamp(t.x, b.x - b.hw, b.x + b.hw),
        cz = clamp(t.z, b.z - b.hd, b.z + b.hd);
      const dx = t.x - cx,
        dz = t.z - cz;
      const d = Math.hypot(dx, dz);
      if (d < TR) {
        if (d > 1e-4) {
          t.x = cx + (dx / d) * TR;
          t.z = cz + (dz / d) * TR;
        } else t.x += TR;
      }
    }
    t.treadPh += t.v * dt * 3;
    if (t.v > 1 && Math.random() < 0.25) this.fx.dust({ x: t.x - Math.sin(t.yaw) * 0.8, y: 0, z: t.z - Math.cos(t.yaw) * 0.8 }, 1, "#e8d8c0");
    if (p.aDown) this.fire(i);
  }

  private fire(i: number) {
    const t = this.tanks[i];
    const live = this.shells.filter((s) => !s.dead && s.owner === i).length;
    if (t.cd > 0) return;
    if (live >= MAX_SHELLS) {
      this.sound("click");
      return;
    }
    t.cd = FIRE_CD;
    const sx = t.x + Math.sin(t.yaw) * 1.25,
      sz = t.z + Math.cos(t.yaw) * 1.25;
    // fired point-blank into a wall: it fizzles
    if (this.hitBox(sx, sz, SHELL_R) || this.outside(sx, sz, SHELL_R)) {
      this.fx.burst({ x: sx, y: 0.8, z: sz }, { count: 6, colors: ["#8a8494", "#ffd23f"], speed: 2, size: 0.15, life: 0.4 });
      this.sound("bonk");
      return;
    }
    const m = new THREE.Mesh(this.shellGeo, toon(this.players[i].char.color, "#fff0a0", 0.55));
    m.scale.setScalar(1.35);
    m.castShadow = true;
    this.scene.add(m);
    this.shells.push({ m, x: sx, z: sz, vx: Math.sin(t.yaw) * SHELL_V, vz: Math.cos(t.yaw) * SHELL_V, owner: i, bounces: 0, age: 0, dead: false });
    t.recoil = 1;
    t.flash.visible = true;
    t.flash.scale.setScalar(0.35);
    this.sound("shoot");
    this.fx.burst({ x: sx, y: 0.82, z: sz }, { count: 6, colors: ["#ffd23f", "#ffffff", "#8a8494"], speed: 3, size: 0.14, life: 0.3 });
    this.avatars[i].anim = "throw";
  }

  private updateShells(dt: number) {
    const sub = 3;
    const h = dt / sub;
    for (const s of this.shells) {
      if (s.dead) continue;
      s.age += dt;
      for (let k = 0; k < sub && !s.dead; k++) {
        const nx = s.x + s.vx * h,
          nz = s.z + s.vz * h;
        const b = this.hitBox(nx, nz, SHELL_R);
        const out = this.outside(nx, nz, SHELL_R);
        if (b || out) {
          if (s.bounces >= 1) {
            this.pop(s);
            break;
          }
          s.bounces++;
          if (out) {
            if (Math.abs(nx) > HX - SHELL_R) s.vx = -s.vx;
            if (Math.abs(nz) > HZ - SHELL_R) s.vz = -s.vz;
          } else if (b) {
            if (Math.abs(s.x - b.x) < b.hw + SHELL_R) s.vz = -s.vz;
            else s.vx = -s.vx;
          }
          this.sound("bonk");
          this.fx.burst({ x: s.x, y: 0.8, z: s.z }, { count: 5, colors: ["#ffffff", "#ffd23f"], speed: 3, size: 0.1, life: 0.25 });
          continue;
        }
        s.x = nx;
        s.z = nz;
        if (!this.finished)
          for (let j = 0; j < this.tanks.length; j++) {
            const t = this.tanks[j];
            if (!t.alive) continue;
            if (j === s.owner && s.bounces === 0) continue;
            if (dist2(s.x, s.z, t.x, t.z) < HIT_R + SHELL_R) {
              this.hitTank(j, s);
              break;
            }
          }
      }
      if (s.dead) continue;
      if (s.age > 5) this.pop(s);
      s.m.position.set(s.x, 0.82, s.z);
      s.m.rotation.set(Math.PI / 2, 0, 0);
      s.m.rotation.y = 0;
      s.m.lookAt(s.x + s.vx, 0.82, s.z + s.vz);
      s.m.rotateX(Math.PI / 2);
      if (Math.random() < 0.6) this.fx.burst({ x: s.x, y: 0.82, z: s.z }, { count: 1, colors: ["#d8d0c8", "#b8b0a8"], speed: 0.3, gravity: -0.5, size: 0.14, sizeEnd: 0.02, life: 0.4, shape: "ball" });
    }
    // shells cancel each other out
    for (let a = 0; a < this.shells.length; a++)
      for (let b = a + 1; b < this.shells.length; b++) {
        const A = this.shells[a],
          B = this.shells[b];
        if (A.dead || B.dead) continue;
        if (dist2(A.x, A.z, B.x, B.z) < SHELL_R * 2.5) {
          this.pop(A);
          this.pop(B);
        }
      }
    this.shells = this.shells.filter((s) => !s.dead);
  }

  private pop(s: Shell) {
    s.dead = true;
    s.m.removeFromParent();
    this.fx.burst({ x: s.x, y: 0.8, z: s.z }, { count: 10, colors: ["#ffd23f", "#ff9a2e", "#8a8494"], speed: 3, size: 0.16, life: 0.35, shape: "ball" });
    this.sound("pop");
  }

  private hitTank(j: number, s: Shell) {
    const t = this.tanks[j];
    s.dead = true;
    s.m.removeFromParent();
    if (t.invul > 0) {
      // deflected by the shield
      this.fx.burst({ x: s.x, y: 0.8, z: s.z }, { count: 8, colors: ["#ffffff", "#9fdcff"], speed: 3, size: 0.12, life: 0.3 });
      this.sound("bonk");
      return;
    }
    t.lives--;
    t.invul = INVUL;
    // knocked back a bit
    const dx = t.x - s.x,
      dz = t.z - s.z,
      d = Math.hypot(dx, dz) || 1;
    t.x += (dx / d) * 0.25;
    t.z += (dz / d) * 0.25;
    if (s.owner !== j) {
      this.tanks[s.owner].kills++;
      this.hud.setScore(this.players[s.owner].seat, this.cardHtml(this.tanks[s.owner].lives, this.tanks[s.owner].kills));
      this.buzz(s.owner, 30);
    }
    this.hud.setScore(this.players[j].seat, this.cardHtml(t.lives, t.kills));
    this.fx.explosion({ x: t.x, y: 0.8, z: t.z }, 1.8);
    this.sound("explode");
    this.shake = Math.max(this.shake, 0.4);
    this.buzz(j, [100, 50, 100]);
    this.avatars[j].flash();
    this.avatars[j].anim = "stun";
    this.hud.pop(new THREE.Vector3(t.x, 2.2, t.z), s.owner === j ? T("Oops!", "哎呀！") : "-1 ♥", "#ff5a6e", this.camera);
    if (t.lives <= 0) this.destroy(j);
  }

  private destroy(j: number) {
    const t = this.tanks[j];
    t.alive = false;
    t.v = 0;
    this.out.push(j);
    t.bodyMat.color.set("#3a3440");
    t.bodyMat.emissiveIntensity = 0;
    this.fx.explosion({ x: t.x, y: 1, z: t.z }, 3.2);
    this.fx.burst({ x: t.x, y: 1, z: t.z }, { count: 16, colors: [this.players[j].char.color, "#3a3a44", "#8a8a9a"], speed: 7, up: 5, gravity: 14, size: 0.25, life: 1.1 });
    this.sound("crash");
    this.shake = 0.8;
    const a = Math.random() * Math.PI * 2;
    t.eject = { t: 0, vx: Math.sin(a) * 2, vy: 9, vz: Math.cos(a) * 2, y: 0.55 };
    this.avatars[j].anim = "fall";
    const place = this.players.length - this.out.length + 1;
    this.hud.setScore(this.players[j].seat, `K.O. ${ordinal(place)}`);
    this.hud.mark(this.players[j].seat, "out");
    const alive = this.tanks.filter((o) => o.alive).length;
    if (alive >= 2) this.hud.banner(alive === 2 ? T("Final duel!", "最终决斗！") : T(`${alive} tanks left!`, `只剩 ${alive} 辆坦克！`), { color: "#ffffff", size: 6, ms: 900 });
  }

  private collideTanks() {
    for (let i = 0; i < this.tanks.length; i++)
      for (let j = i + 1; j < this.tanks.length; j++) {
        const A = this.tanks[i],
          B = this.tanks[j];
        const dx = B.x - A.x,
          dz = B.z - A.z;
        const d = Math.hypot(dx, dz);
        if (d < TR * 2 && d > 1e-4) {
          const push = (TR * 2 - d) / 2;
          if (A.alive) {
            A.x -= (dx / d) * push * (B.alive ? 1 : 2);
            A.z -= (dz / d) * push * (B.alive ? 1 : 2);
          }
          if (B.alive) {
            B.x += (dx / d) * push * (A.alive ? 1 : 2);
            B.z += (dz / d) * push * (A.alive ? 1 : 2);
          }
        }
      }
  }

  private placeTanks(dt: number) {
    const now = performance.now() / 1000;
    this.tanks.forEach((t, i) => {
      const a = this.avatars[i];
      t.g.position.set(t.x, 0, t.z);
      t.g.rotation.y = t.yaw;
      t.body.position.z = -t.recoil * 0.12;
      t.body.rotation.x = -t.recoil * 0.08 + (t.v > 0.5 ? Math.sin(now * 30) * 0.008 : 0);
      if (t.flash.visible) {
        t.flash.scale.multiplyScalar(Math.exp(-14 * dt));
        if (t.flash.scale.x < 0.05) t.flash.visible = false;
      }
      // invulnerable: blink
      t.g.visible = !(t.alive && t.invul > 0 && Math.floor(t.invul * 12) % 2 === 0);
      t.bodyMat.emissiveIntensity = t.alive && t.invul > INVUL - 0.15 ? 0.8 : 0;
      if (!t.alive && Math.random() < 0.15) this.fx.burst({ x: t.x, y: 1, z: t.z }, { count: 1, colors: ["#4a4458", "#6a6478"], speed: 0.4, up: 1.5, gravity: -1, size: 0.35, sizeEnd: 0.1, life: 1.4, shape: "ball" });
      // the rider
      if (t.eject) {
        const e = t.eject;
        e.t += dt;
        e.vy -= 20 * dt;
        e.y += e.vy * dt;
        a.pos.x += e.vx * dt;
        a.pos.z += e.vz * dt;
        if (e.y <= 0 && e.vy < 0) {
          e.y = 0;
          t.eject = null;
          a.anim = "lose";
          this.fx.dust(a.pos, 8);
          this.sound("thud");
        }
        a.pos.y = e.y;
        a.groundY = 0;
        return;
      }
      if (!t.alive) return;
      a.pos.set(t.x - Math.sin(t.yaw) * 0.1, 0.62 - t.recoil * 0.05, t.z - Math.cos(t.yaw) * 0.1);
      a.yaw = t.yaw;
      a.groundY = a.pos.y;
      a.setVisible(t.g.visible);
      if (a.anim === "throw" && t.cd < FIRE_CD - 0.3) a.anim = "idle";
      if (a.anim === "stun" && t.invul < INVUL - 0.7) a.anim = "idle";
    });
  }

  dispose() {
    this.shellGeo.dispose();
    super.dispose();
  }
}

const def: MiniDef = {
  id: "chars",
  name: "Tank Brawl",
  icon: "💥",
  color: "#7a8a4a",
  tagline: "Little tanks, three lives each.",
  rules: "Drive your tank and fire (A): shells bounce once off the walls. Three lives each; the last tank running wins!",
  controls: { stick: "Drive", a: "Fire" },
  modes: ["ffa"],
  length: 60,
  music: "mini",
  create: (ctx) => new Chars(ctx),
};
export default def;
