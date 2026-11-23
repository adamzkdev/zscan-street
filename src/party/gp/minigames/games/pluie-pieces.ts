/**
 * PLUIE DE PIÈCES (chacun pour soi, 30 s): coins rain on a round Parisian plaza; a shadow shows
 * where each lands. Big gold coins are worth 5. Bombs fall too: they blink and blow, stunning whoever
 * is near and making them drop 3 coins. A = a short dash: dashing into a rival knocks 2 coins out.
 * From 10 s left: the rain doubles. Most coins wins.
 *
 * (The reference mini-game: see how it uses BaseMini, the HUD, CPUs and the particles.)
 */
import * as THREE from "three";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef } from "../types";
import { GEO, ball, blobShadow, box, canvasTex, coinMesh, cone, cyl, flat, group, toon, tree } from "../../engine/gfx";
import { clamp, dist2 } from "../../engine/util";
import { COIN } from "../../engine/hud";
import { music } from "../../engine/audio";
import { T } from "../../../../i18n/lang";

const TIME = 30;
const R = 9.2; // arena radius
const FOUNTAIN = 1.7;
const PR = 0.45; // player radius
const SPEED = 6.4;
const DASH_V = 13;
const DASH_T = 0.2;
const DASH_CD = 1.0;
const STUN = 1.1;
const SKY_Y = 13;

interface Coin {
  g: THREE.Object3D;
  shadow: THREE.Mesh;
  x: number;
  z: number;
  y: number;
  vy: number;
  vx: number;
  vz: number;
  value: number;
  landed: boolean;
  age: number;
  /** Not pickable before this game time (dropped coins fly a bit first). */
  pickAt: number;
  dead: boolean;
}
interface Bomb {
  g: THREE.Group;
  shadow: THREE.Mesh;
  warn: THREE.Mesh;
  x: number;
  z: number;
  y: number;
  vy: number;
  landed: boolean;
  fuse: number;
  dead: boolean;
}
interface Runner {
  x: number;
  z: number;
  vx: number;
  vz: number;
  dashT: number;
  dashCd: number;
  stun: number;
  coins: number;
  /** Immune to hits for a moment after one. */
  safe: number;
}

class PluieDePieces extends BaseMini {
  private coins: Coin[] = [];
  private bombs: Bomb[] = [];
  private run: Runner[] = [];
  private nextCoin = 0;
  private nextBomb = 2.5;
  private hurried = false;
  private water!: THREE.Mesh;
  private coinGeoCache: THREE.Object3D;
  private bigCoin: THREE.Object3D;

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#6cc0ff", "#fff1d6"], size: 13, sun: [0.6, 1, 0.45], fog: { near: 40, far: 90 } });
    this.coinGeoCache = coinMesh(0.38);
    this.bigCoin = coinMesh(0.62);
    this.buildPlaza();
    const starts = [
      [-4, -3],
      [4, -3],
      [-4, 3.5],
      [4, 3.5],
    ];
    this.players.forEach((p, i) => {
      const [x, z] = starts[i];
      const a = this.spawn(i, x, z, Math.atan2(-x, -z));
      a.setRing(p.char.color);
      this.run.push({ x, z, vx: 0, vz: 0, dashT: 0, dashCd: 0, stun: 0, coins: 0, safe: 0 });
    });
    this.hud.players(this.players, () => `${COIN} 0`);
    this.hud.timer(TIME);
    this.setCam([0, 30, 26], [0, 0, 0.8], 42);
  }

  // ------------------------------------------------------------ the plaza

  private buildPlaza() {
    const s = this.scene;
    // paving: concentric rings of cream stones
    const tex = canvasTex(1024, 1024, (g, w) => {
      g.fillStyle = "#efe2c6";
      g.fillRect(0, 0, w, w);
      const c = w / 2;
      for (let r = 40; r < c; r += 46) {
        const n = Math.max(8, Math.floor((r * 2 * Math.PI) / 70));
        for (let i = 0; i < n; i++) {
          const a0 = (i / n) * Math.PI * 2,
            a1 = ((i + 1) / n) * Math.PI * 2;
          g.beginPath();
          g.arc(c, c, r + 44, a0 + 0.01, a1 - 0.01);
          g.arc(c, c, r + 2, a1 - 0.01, a0 + 0.01, true);
          g.closePath();
          const k = ((i * 7 + r) % 5) / 5;
          g.fillStyle = k < 0.2 ? "#e2d1ad" : k < 0.4 ? "#f6ead2" : "#ecdcbc";
          g.fill();
        }
      }
      // a compass star in the middle ring
      g.fillStyle = "#c98a5a";
      g.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const rr = i % 2 ? 150 : 330;
        g.lineTo(c + Math.cos(a) * rr, c + Math.sin(a) * rr);
      }
      g.closePath();
      g.globalAlpha = 0.25;
      g.fill();
      g.globalAlpha = 1;
    });
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.4, R + 0.6, 0.6, 64), [toon("#c9b48e"), new THREE.MeshToonMaterial({ map: tex }), toon("#c9b48e")]);
    floor.position.y = -0.3;
    floor.receiveShadow = true;
    s.add(floor);
    // the border: a low stone ring with flower beds
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R + 0.5, 0.35, 10, 80), toon("#d8c7a4"));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.05;
    rim.castShadow = rim.receiveShadow = true;
    s.add(rim);
    const flowers = ["#ff5a7a", "#ffd23f", "#ffffff", "#ff8ad8", "#8a6aff"];
    for (let i = 0; i < 44; i++) {
      const a = (i / 44) * Math.PI * 2;
      const rr = R + 1.4;
      ball(s, "#3f9a3a", 0.55, { x: Math.cos(a) * rr, y: 0.25, z: Math.sin(a) * rr, lo: true });
      ball(s, flowers[i % flowers.length], 0.12, { x: Math.cos(a) * rr, y: 0.75, z: Math.sin(a) * rr, lo: true, cast: false });
    }
    // grass outside
    const grass = new THREE.Mesh(new THREE.CircleGeometry(60, 48), toon("#8fd16a"));
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.55;
    grass.receiveShadow = true;
    s.add(grass);
    // lamp posts and string lights
    const lamps: THREE.Vector3[] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const x = Math.cos(a) * (R + 2.4),
        z = Math.sin(a) * (R + 2.4);
      const g = group(s, { x, z });
      cyl(g, "#2d3a4a", 0.09, 3.6, { y: 1.8, seg: 8 });
      cyl(g, "#2d3a4a", 0.25, 0.3, { y: 0.15, seg: 8 });
      ball(g, toon("#fff3b0", "#ffcc33", 0.9), 0.28, { y: 3.75 });
      cone(g, "#2d3a4a", 0.32, 0.3, { y: 4.1, lo: true });
      lamps.push(new THREE.Vector3(x, 3.5, z));
    }
    const bulbCols = ["#ff4b3e", "#ffd23f", "#3fcf5a", "#2f8dff", "#ff7ad9"];
    for (let i = 0; i < lamps.length; i++) {
      const a = lamps[i],
        b = lamps[(i + 1) % lamps.length];
      for (let k = 1; k < 9; k++) {
        const t = k / 9;
        const p = a.clone().lerp(b, t);
        p.y -= Math.sin(t * Math.PI) * 0.9;
        ball(s, flat(bulbCols[(i * 9 + k) % 5]), 0.1, { x: p.x, y: p.y, z: p.z, lo: true, cast: false });
      }
    }
    // the fountain
    const f = group(s);
    cyl(f, "#d8c7a4", FOUNTAIN, 0.6, { y: 0.3, seg: 32 });
    this.water = new THREE.Mesh(GEO.circle, toon("#6fd0ff", "#2a8fd0", 0.4));
    this.water.rotation.x = -Math.PI / 2;
    this.water.scale.setScalar(FOUNTAIN - 0.2);
    this.water.position.y = 0.61;
    f.add(this.water);
    cyl(f, "#d8c7a4", 0.3, 1.6, { y: 1.2, seg: 16 });
    cyl(f, "#d8c7a4", 0.8, 0.2, { y: 1.9, seg: 24 });
    // (a big ⓩ on top, tilted toward the camera)
    const top = coinMesh(0.55);
    top.position.y = 2.6;
    top.rotation.x = -0.5;
    f.add(top);
    // Parisian façades all around (cream stone, blue-grey roofs)
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      const rr = 21 + (i % 3) * 1.5;
      const h = 6 + ((i * 37) % 5);
      const g = group(s, { x: Math.cos(a) * rr, z: Math.sin(a) * rr, ry: -a + Math.PI / 2 });
      box(g, i % 2 ? "#f3e6cc" : "#ead8b6", 5.4, h, 3, { y: h / 2 });
      box(g, "#6d7f96", 5.6, 1.4, 3.2, { y: h + 0.5 });
      for (let fy = 0; fy < Math.floor(h / 2) - 0.5; fy++)
        for (let fx = -2; fx <= 2; fx++) {
          if (fx === 0 && fy === 0) continue;
          box(g, "#4a5a7a", 0.55, 0.9, 0.1, { x: fx, y: 1.4 + fy * 2, z: -1.52, cast: false });
          box(g, "#2d2d38", 0.7, 0.08, 0.25, { x: fx, y: 0.9 + fy * 2, z: -1.6, cast: false });
        }
    }
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + 0.2;
      tree(s, Math.cos(a) * 15.5, Math.sin(a) * 15.5, 1.3 + (i % 3) * 0.25, i % 2 ? "#5cc44f" : "#48b04a");
    }
  }

  // ------------------------------------------------------------ spawning

  private spawnCoin(value: number, x?: number, z?: number, from?: { x: number; z: number }) {
    const g = (value >= 5 ? this.bigCoin : this.coinGeoCache).clone();
    if (x === undefined || z === undefined) {
      for (;;) {
        const a = this.rnd() * Math.PI * 2,
          r = Math.sqrt(this.rnd()) * (R - 0.8);
        x = Math.cos(a) * r;
        z = Math.sin(a) * r;
        if (Math.hypot(x, z) > FOUNTAIN + 0.6) break;
      }
    }
    const c: Coin = { g, shadow: blobShadow(value >= 5 ? 0.6 : 0.4, 0.0), x, z, y: SKY_Y + this.rnd() * 3, vy: -4, vx: 0, vz: 0, value, landed: false, age: 0, pickAt: 0, dead: false };
    if (from) {
      // a dropped coin: pops out of a player and flies a little
      c.x = from.x;
      c.z = from.z;
      c.y = 1;
      const a = this.rnd() * Math.PI * 2;
      c.vx = Math.cos(a) * 3.2;
      c.vz = Math.sin(a) * 3.2;
      c.vy = 6;
      c.pickAt = this.t + 0.45;
    }
    this.scene.add(g, c.shadow);
    this.coins.push(c);
  }

  private spawnBomb() {
    const g = group(this.scene);
    ball(g, "#2a2438", 0.5);
    cyl(g, "#5a5470", 0.15, 0.25, { y: 0.5, seg: 8 });
    const spark = ball(g, flat("#ffb02e"), 0.12, { y: 0.7, cast: false });
    spark.name = "spark";
    let x = 0,
      z = 0;
    // aim near a random player half the time
    if (this.rnd() < 0.5) {
      const r = this.run[Math.floor(this.rnd() * this.run.length)];
      x = r.x + (this.rnd() - 0.5) * 3;
      z = r.z + (this.rnd() - 0.5) * 3;
    } else {
      const a = this.rnd() * Math.PI * 2,
        rr = Math.sqrt(this.rnd()) * (R - 1);
      x = Math.cos(a) * rr;
      z = Math.sin(a) * rr;
    }
    if (Math.hypot(x, z) < FOUNTAIN + 0.6) x += FOUNTAIN + 1;
    const l = Math.hypot(x, z);
    if (l > R - 0.8) {
      x *= (R - 0.8) / l;
      z *= (R - 0.8) / l;
    }
    const warn = new THREE.Mesh(GEO.ring, new THREE.MeshBasicMaterial({ color: "#ff3b3b", transparent: true, opacity: 0.6, depthWrite: false }));
    warn.rotation.x = -Math.PI / 2;
    warn.scale.setScalar(2.3);
    warn.position.set(x, 0.04, z);
    this.scene.add(warn);
    const b: Bomb = { g, shadow: blobShadow(0.5, 0), warn, x, z, y: SKY_Y + 2, vy: -3, landed: false, fuse: 1.1, dead: false };
    this.scene.add(b.shadow);
    this.bombs.push(b);
  }

  // ------------------------------------------------------------ CPUs

  protected cpu(i: number): CpuPad {
    const me = this.run[i];
    const lv = this.players[i].level;
    // flee a bomb about to blow
    for (const b of this.bombs) {
      if (b.dead) continue;
      const d = dist2(me.x, me.z, b.x, b.z);
      if (d < 3 && (b.landed || b.y < 4)) {
        const k = 1 / Math.max(0.2, d);
        return { x: (me.x - b.x) * k, y: (me.z - b.z) * k };
      }
    }
    // the best coin: value over distance, coins about to land count where they'll land
    let best: Coin | null = null,
      bestS = 0;
    for (const c of this.coins) {
      if (c.dead || c.pickAt > this.t + 0.5) continue;
      const d = dist2(me.x, me.z, c.x, c.z);
      const eta = c.landed ? 0 : c.y / 9;
      const s = (c.value * (1 + lv)) / (d + 1.5 + Math.abs(eta - d / SPEED) * (1 - lv));
      if (s > bestS) {
        bestS = s;
        best = c;
      }
    }
    // dash at a rich rival close by
    for (let j = 0; j < this.run.length; j++) {
      if (j === i) continue;
      const o = this.run[j];
      const d = dist2(me.x, me.z, o.x, o.z);
      if (d < 2.2 && o.coins > 2 && me.dashCd <= 0 && o.stun <= 0 && this.cpuChance(i, 0.01, 0.08)) {
        return { x: o.x - me.x, y: o.z - me.z, a: true };
      }
    }
    if (!best) return { x: -me.x * 0.1, y: -me.z * 0.1 };
    const dx = best.x - me.x,
      dz = best.z - me.z;
    const d = Math.hypot(dx, dz);
    const wobble = (1 - lv) * 0.6;
    return { x: dx / (d || 1) + Math.sin(this.t * 3 + i) * wobble, y: dz / (d || 1) + Math.cos(this.t * 2.3 + i) * wobble, a: d > 4 && me.dashCd <= 0 && this.cpuChance(i, 0.0, 0.03) };
  }

  // ------------------------------------------------------------ the game

  start() {
    this.nextCoin = 0;
  }

  protected idle(dt: number) {
    this.water.rotation.z += dt * 0.3;
    // fly in from high above during the intro
    this.moveCam([0, 17, 15.5], [0, 0, 0.8], dt, 1.6);
  }

  protected step(dt: number) {
    const left = TIME - this.t;
    this.hud.timer(left);
    this.water.rotation.z += dt * 0.3;
    this.moveCam([0, 17, 15.5], [0, 0, 0.8], dt, 3);
    if (!this.hurried && left <= 10) {
      this.hurried = true;
      this.hud.banner(T("DOWNPOUR!", "暴雨来了！"), { color: "#ffd23f", sub: T("Double the ⓩ rain", "ⓩ雨加倍") });
      music.speed(1.18);
      this.sound("bell");
    }
    // the rain
    this.nextCoin -= dt;
    if (this.nextCoin <= 0) {
      const big = this.rnd() < 0.07;
      this.spawnCoin(big ? 5 : 1);
      this.nextCoin = (this.hurried ? 0.09 : 0.2) * (0.6 + this.rnd() * 0.8);
    }
    this.nextBomb -= dt;
    if (this.nextBomb <= 0) {
      this.spawnBomb();
      this.nextBomb = (this.hurried ? 1.4 : 2.2) * (0.7 + this.rnd() * 0.6);
    }

    // the players
    this.run.forEach((r, i) => {
      const a = this.avatars[i];
      const p = this.pad(i);
      r.dashCd -= dt;
      r.safe -= dt;
      if (r.stun > 0) {
        r.stun -= dt;
        r.vx *= Math.exp(-6 * dt);
        r.vz *= Math.exp(-6 * dt);
        a.anim = "stun";
      } else if (r.dashT > 0) {
        r.dashT -= dt;
        a.anim = "jump";
      } else {
        const tx = p.x * SPEED,
          tz = p.y * SPEED;
        const k = 1 - Math.exp(-12 * dt);
        r.vx += (tx - r.vx) * k;
        r.vz += (tz - r.vz) * k;
        if (p.aDown && r.dashCd <= 0) {
          const l = Math.hypot(p.x, p.y);
          const yaw = l > 0.2 ? Math.atan2(p.x, p.y) : a.yaw;
          r.vx = Math.sin(yaw) * DASH_V;
          r.vz = Math.cos(yaw) * DASH_V;
          r.dashT = DASH_T;
          r.dashCd = DASH_CD;
          this.sound("whoosh");
          this.fx.dust(a.pos, 8);
        }
        const sp = Math.hypot(r.vx, r.vz);
        a.anim = sp > 0.6 ? "run" : "idle";
        a.speed = clamp(sp / SPEED, 0, 1);
      }
      r.x += r.vx * dt;
      r.z += r.vz * dt;
      // walls: the arena edge and the fountain
      const d = Math.hypot(r.x, r.z);
      if (d > R - PR) {
        r.x *= (R - PR) / d;
        r.z *= (R - PR) / d;
      }
      if (d < FOUNTAIN + PR) {
        const k = (FOUNTAIN + PR) / (d || 1);
        r.x *= k;
        r.z *= k;
      }
      if (Math.hypot(r.vx, r.vz) > 0.5 && r.stun <= 0) a.face(Math.atan2(r.vx, r.vz), dt);
      a.pos.set(r.x, 0, r.z);
    });
    // bumps between players (a dash knocks coins out)
    for (let i = 0; i < this.run.length; i++)
      for (let j = i + 1; j < this.run.length; j++) {
        const A = this.run[i],
          B = this.run[j];
        const dx = B.x - A.x,
          dz = B.z - A.z;
        const d = Math.hypot(dx, dz);
        if (d < PR * 2 && d > 1e-4) {
          const push = (PR * 2 - d) / 2;
          A.x -= (dx / d) * push;
          A.z -= (dz / d) * push;
          B.x += (dx / d) * push;
          B.z += (dz / d) * push;
          for (const [att, vic, vi] of [
            [A, B, j],
            [B, A, i],
          ] as const) {
            if (att.dashT > 0 && vic.safe <= 0 && vic.stun <= 0) {
              this.hitPlayer(vi, 2, 0.6, att);
            }
          }
        }
      }
    // coins
    for (const c of this.coins) {
      if (c.dead) continue;
      c.age += dt;
      if (!c.landed) {
        c.vy -= 22 * dt;
        c.y += c.vy * dt;
        c.x += c.vx * dt;
        c.z += c.vz * dt;
        const l = Math.hypot(c.x, c.z);
        if (l > R - 0.4) {
          c.x *= (R - 0.4) / l;
          c.z *= (R - 0.4) / l;
          c.vx = c.vz = 0;
        }
        if (c.y <= 0.45) {
          c.y = 0.45;
          if (Math.abs(c.vy) > 4) {
            c.vy = -c.vy * 0.35;
            c.vx *= 0.5;
            c.vz *= 0.5;
            if (c.value >= 5) this.fx.sparkle({ x: c.x, y: 0.5, z: c.z }, "#ffe14a", 8);
          } else {
            c.landed = true;
            c.vy = 0;
          }
        }
      }
      c.g.position.set(c.x, c.y + (c.landed ? Math.sin(c.age * 4) * 0.08 : 0), c.z);
      c.g.rotation.y += dt * (c.landed ? 3 : 9);
      const h = c.y;
      c.shadow.position.set(c.x, 0.03, c.z);
      (c.shadow.material as THREE.MeshBasicMaterial).opacity = clamp(0.45 - h * 0.02, 0.12, 0.45);
      c.shadow.scale.setScalar((c.value >= 5 ? 1.2 : 0.8) * clamp(1.4 - h * 0.05, 0.6, 1.4));
      // despawn old coins (blinking first)
      const life = c.value >= 5 ? 12 : 9;
      if (c.landed && c.age > life - 2) c.g.visible = Math.floor(c.age * 10) % 2 === 0;
      if (c.age > life) this.removeCoin(c);
      // pick up
      if (c.y < 1.6 && this.t >= c.pickAt) {
        for (let i = 0; i < this.run.length; i++) {
          const r = this.run[i];
          if (r.stun > 0) continue;
          if (dist2(r.x, r.z, c.x, c.z) < (c.value >= 5 ? 1.05 : 0.85)) {
            r.coins += c.value;
            this.hud.setScore(this.players[i].i, `${COIN} ${r.coins}`);
            this.fx.sparkle({ x: c.x, y: 0.8, z: c.z }, c.value >= 5 ? "#ffe14a" : "#fff6a8", c.value >= 5 ? 22 : 8);
            this.hud.pop(new THREE.Vector3(c.x, 2.2, c.z), `+${c.value}`, "#ffe14a", this.camera);
            this.sound(c.value >= 5 ? "coins" : "coin");
            if (c.value >= 5) this.buzz(i, 30);
            this.removeCoin(c);
            break;
          }
        }
      }
    }
    this.coins = this.coins.filter((c) => !c.dead);
    // bombs
    for (const b of this.bombs) {
      if (b.dead) continue;
      if (!b.landed) {
        b.vy -= 20 * dt;
        b.y += b.vy * dt;
        if (b.y <= 0.5) {
          b.y = 0.5;
          b.landed = true;
          this.sound("thud");
        }
      } else {
        b.fuse -= dt;
        const blink = b.fuse < 0.5 ? 20 : 10;
        b.g.scale.setScalar(1 + (Math.sin(this.t * blink) > 0 ? 0.12 : 0));
        if (b.fuse <= 0) this.blow(b);
      }
      b.g.position.set(b.x, b.y, b.z);
      b.g.rotation.y += dt * 2;
      b.shadow.position.set(b.x, 0.03, b.z);
      (b.shadow.material as THREE.MeshBasicMaterial).opacity = clamp(0.5 - b.y * 0.02, 0.15, 0.5);
      (b.warn.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.35 * Math.abs(Math.sin(this.t * 8));
    }
    this.bombs = this.bombs.filter((b) => !b.dead);

    if (left <= 0) {
      const scores = this.run.map((r) => r.coins);
      this.finishByScore(scores, false, scores);
    }
  }

  private hitPlayer(i: number, drop: number, stun: number, from?: Runner) {
    const r = this.run[i];
    const a = this.avatars[i];
    const lost = Math.min(drop, r.coins);
    r.coins -= lost;
    for (let k = 0; k < lost; k++) this.spawnCoin(1, undefined, undefined, { x: r.x, z: r.z });
    r.stun = stun;
    r.safe = stun + 0.8;
    if (from) {
      const dx = r.x - from.x,
        dz = r.z - from.z,
        d = Math.hypot(dx, dz) || 1;
      r.vx = (dx / d) * 7;
      r.vz = (dz / d) * 7;
      from.vx *= 0.2;
      from.vz *= 0.2;
      from.dashT = 0;
    }
    a.flash();
    this.hud.setScore(this.players[i].i, `${COIN} ${r.coins}`);
    if (lost) this.hud.pop(new THREE.Vector3(r.x, 2.4, r.z), `-${lost}`, "#ff6a5a", this.camera);
    this.sound("bonk");
    this.buzz(i, [60, 40, 60]);
    this.fx.burst({ x: r.x, y: 1, z: r.z }, { count: 10, colors: ["#ffffff", "#ffe14a"], speed: 4, size: 0.15 });
  }

  private blow(b: Bomb) {
    b.dead = true;
    this.fx.explosion({ x: b.x, y: 0.6, z: b.z }, 2.2);
    this.sound("explode");
    this.shake = 0.5;
    this.run.forEach((r, i) => {
      const d = dist2(r.x, r.z, b.x, b.z);
      if (d < 2.3 && r.safe <= 0) {
        this.hitPlayer(i, 3, STUN);
        const k = 1 / (d || 1);
        r.vx = (r.x - b.x) * k * 9;
        r.vz = (r.z - b.z) * k * 9;
      }
    });
    b.g.removeFromParent();
    b.shadow.removeFromParent();
    b.warn.removeFromParent();
    (b.warn.material as THREE.Material).dispose();
    (b.shadow.material as THREE.Material).dispose();
  }

  private removeCoin(c: Coin) {
    c.dead = true;
    c.g.removeFromParent();
    c.shadow.removeFromParent();
    (c.shadow.material as THREE.Material).dispose();
  }

  protected outroStep(dt: number) {
    this.water.rotation.z += dt * 0.3;
    for (const c of this.coins) c.g.rotation.y += dt * 3;
  }
}

const def: MiniDef = {
  id: "pluie-pieces",
  name: "Zatoshi Rain",
  icon: "🪙",
  color: "#ffc928",
  tagline: "It's raining ⓩ coins! Grab the most.",
  rules: "Catch the falling ⓩ (big ones are worth 5). Dodge the bombs: they cost you 3. A rush into a rival knocks 2 ⓩ out.",
  controls: { stick: "Run", a: "Rush" },
  modes: ["ffa"],
  length: 30,
  music: "mini",
  create: (ctx) => new PluieDePieces(ctx),
};
export default def;
