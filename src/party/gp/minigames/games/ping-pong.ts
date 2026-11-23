/**
 * PING-PONG (duel, first to 5 points, 90 s max): table tennis in a holiday-camp hall, seen from
 * the side. The stick moves you behind your end of the table; A hits the ball once it has bounced
 * on your side and is within reach. Hitting early sends it to your left, late to your right;
 * holding the stick toward the table hits harder, up/down adds side spin (it kicks after the bounce).
 * Into the net, off the table or a missed return: a point for the other one.
 */
import * as THREE from "three";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef, MiniResult } from "../types";
import { GEO, ball, blobShadow, box, canvasTex, cyl, flat, group, toon } from "../../engine/gfx";
import { clamp, damp } from "../../engine/util";
import { music } from "../../engine/audio";
import { T } from "../../../../i18n/lang";

const TIME = 90;
const TARGET = 5;
const TL = 2.9; // table half-length (x)
const TW = 1.6; // table half-width (z)
const TH = 0.74; // table top
const NH = 0.26; // net height above the table
const BR = 0.13;
const G = 6.2;
const SPEED = 4.6;
const REACH_X = 0.95;
const REACH_Z = 0.9;
const HIT_X = TL + 0.75; // where the paddle meets the ball, from the centre

interface Pl {
  x: number;
  z: number;
  vx: number;
  vz: number;
  swing: number;
  cd: number;
  buf: number;
  score: number;
  // CPU
  e: number;
  errZ: number;
  speed: number;
  spin: number;
  seen: number;
  /** CPU: this return will be a mistake. */
  botch: boolean;
  /** The press came before the ball was in reach (a safe, not-too-early hit). */
  early: boolean;
}

type Phase = "serve" | "rally" | "point";

class PingPong extends BaseMini {
  private pl: Pl[] = [];
  private b = { x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0, spin: 0 };
  /** Who hit last, and the bounces since on each side. */
  private hitter = -1;
  private bounces = [0, 0];
  private hits = 0;
  private phase: Phase = "serve";
  private phaseT = 0;
  private server = 0;
  private serveCount = 0;
  private cpuServeAt = 1;
  private ballMesh!: THREE.Mesh;
  private shadow!: THREE.Mesh;
  private paddles: THREE.Group[] = [];
  private flips: THREE.MeshBasicMaterial[] = [];
  private digits: THREE.Texture[] = [];
  private crowd: { g: THREE.Object3D; ph: number }[] = [];
  private cheer = 0;
  private hurried = false;
  private ended = false;

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#f6e4c8", "#e8d0a8"], size: 8, sun: [0.3, 1, 0.7], sunColor: "#fff4e0", sunIntensity: 2.2, hemi: ["#fff8ec", "#8a6a4a", 1.5], fog: null });
    this.buildHall();
    this.players.forEach((p, i) => {
      const sd = this.side(i);
      const a = this.spawn(i, sd * (HIT_X + 0.35), 0.2, sd < 0 ? Math.PI / 2 : -Math.PI / 2);
      a.setRing(p.char.color);
      this.pl.push({ x: sd * (HIT_X + 0.35), z: 0.2, vx: 0, vz: 0, swing: 0, cd: 0, buf: 0, score: 0, e: 0, errZ: 0, speed: 0, spin: 0, seen: -1, botch: false, early: false });
      // the paddle, in the hand on the camera's side
      const arm = i === 0 ? a.rig.armL : a.rig.armR;
      const pg = group(arm, { y: -0.34 });
      cyl(pg, "#6a4a2a", 0.03, 0.16, { y: 0.02, seg: 6 });
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.03, 20), [toon("#d8c8a0"), toon("#d83a3a"), toon("#2a2a30")]);
      head.position.y = -0.2;
      head.rotation.x = Math.PI / 2;
      head.castShadow = true;
      pg.add(head);
      this.paddles.push(pg);
    });
    this.hud.players(this.players, () => "0");
    this.hud.timer(TIME);
    this.server = this.rnd() < 0.5 ? 0 : 1;
    this.setupServe();
    this.setCam([0, 7, 12], [0, 0.7, 0], 46);
  }

  /** Player 0 plays on the left (-x), player 1 on the right. */
  private side(i: number) {
    return i === 0 ? -1 : 1;
  }

  // ------------------------------------------------------------ the hall

  private buildHall() {
    const s = this.scene;
    const wood = canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = "#d8a868";
      g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 32) {
        g.fillStyle = (y / 32) % 2 ? "#cf9e5e" : "#dcae70";
        g.fillRect(0, y, w, 30);
        g.fillStyle = "#b0804a";
        g.fillRect(((y * 7) % w) - 4, y, 3, 32);
      }
    }, true);
    wood.repeat.set(4, 3);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(36, 24), new THREE.MeshToonMaterial({ map: wood }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);
    // court markings
    const lineMat = flat("#ffffff", 0.7);
    for (const sz of [-1, 1]) box(s, lineMat, 14, 0.01, 0.08, { z: sz * 4.2, y: 0.005, cast: false });
    // walls with windows and pennants
    const wall = new THREE.Mesh(GEO.plane, toon("#f4e8d0"));
    wall.scale.set(36, 9, 1);
    wall.position.set(0, 4.5, -7);
    s.add(wall);
    box(s, "#5aa0c8", 36, 1.2, 0.1, { y: 0.6, z: -6.95 });
    const winTex = canvasTex(256, 192, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, "#8ad0ff");
      gr.addColorStop(1, "#d8f0ff");
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#6ac060";
      g.beginPath();
      g.ellipse(70, h, 90, 60, 0, 0, Math.PI * 2);
      g.ellipse(200, h, 110, 45, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#ffffff";
      g.lineWidth = 10;
      g.strokeRect(5, 5, w - 10, h - 10);
      g.beginPath();
      g.moveTo(w / 2, 0);
      g.lineTo(w / 2, h);
      g.stroke();
    });
    const winMat = new THREE.MeshBasicMaterial({ map: winTex });
    for (let k = -2; k <= 2; k++) {
      const wnd = new THREE.Mesh(GEO.plane, winMat);
      wnd.scale.set(2.6, 1.9, 1);
      wnd.position.set(k * 4.2, 3.6, -6.95);
      s.add(wnd);
    }
    const bunt = ["#ff4b3e", "#ffd23f", "#3fcf5a", "#2f8dff", "#ff7ad9"];
    for (let k = 0; k < 30; k++) {
      const x = -11 + k * 0.76;
      const f = new THREE.Mesh(GEO.coneLo, toon(bunt[k % 5]));
      f.scale.set(0.16, 0.3, 0.02);
      f.rotation.x = Math.PI;
      f.position.set(x, 5.6 - Math.sin(((k % 10) / 10) * Math.PI) * 0.4, -6.85);
      s.add(f);
    }
    const sign = canvasTex(512, 128, (g, w, h) => {
      g.fillStyle = "#2f8dff";
      g.beginPath();
      g.roundRect(4, 4, w - 8, h - 8, 30);
      g.fill();
      g.fillStyle = "#ffffff";
      g.font = "800 64px Geist, Roboto, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("ZSTREET OPEN", w / 2, h / 2 + 4);
    });
    const sg = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: sign, transparent: true }));
    sg.scale.set(4, 1, 1);
    sg.position.set(0, 6.4, -6.9);
    s.add(sg);
    // the table
    const t = group(s);
    const top = new THREE.Mesh(GEO.box, [toon("#1a5a8a"), toon("#1a5a8a"), toon("#2a7ab8"), toon("#1a5a8a"), toon("#1a5a8a"), toon("#1a5a8a")]);
    top.scale.set(TL * 2, 0.07, TW * 2);
    top.position.y = TH - 0.035;
    top.castShadow = top.receiveShadow = true;
    t.add(top);
    const white = flat("#ffffff");
    for (const sz of [-1, 1]) box(t, white, TL * 2, 0.005, 0.04, { y: TH + 0.002, z: sz * (TW - 0.02), cast: false });
    for (const sx of [-1, 1]) box(t, white, 0.04, 0.005, TW * 2, { x: sx * (TL - 0.02), y: TH + 0.002, cast: false });
    box(t, white, TL * 2, 0.005, 0.025, { y: TH + 0.002, cast: false });
    for (const [x, z] of [
      [-TL + 0.4, -TW + 0.3],
      [TL - 0.4, -TW + 0.3],
      [-TL + 0.4, TW - 0.3],
      [TL - 0.4, TW - 0.3],
    ])
      box(t, "#3a3a46", 0.08, TH - 0.07, 0.08, { x, z, y: (TH - 0.07) / 2 });
    // the net
    const netTex = canvasTex(256, 32, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.strokeStyle = "#f4f4f4";
      g.lineWidth = 2;
      for (let x = 0; x <= w; x += 8) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, h);
        g.stroke();
      }
      for (let y = 0; y <= h; y += 8) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y);
        g.stroke();
      }
    }, true);
    netTex.repeat.set(3, 1);
    const net = new THREE.Mesh(new THREE.PlaneGeometry(TW * 2 + 0.3, NH), new THREE.MeshBasicMaterial({ map: netTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, color: "#ffffff" }));
    net.rotation.y = Math.PI / 2;
    net.position.y = TH + NH / 2;
    t.add(net);
    box(t, "#ffffff", 0.04, 0.04, TW * 2 + 0.3, { y: TH + NH });
    for (const sz of [-1, 1]) box(t, "#2a2a30", 0.06, NH + 0.06, 0.06, { y: TH + NH / 2, z: sz * (TW + 0.15) });
    // the flip scoreboard behind the table
    const fb = group(s, { z: -TW - 1.6 });
    box(fb, "#3a3a46", 1.7, 0.08, 0.5, { y: 0.02 });
    box(fb, "#3a3a46", 0.08, 1.4, 0.08, { x: -0.8, y: 0.7, z: -0.15 });
    box(fb, "#3a3a46", 0.08, 1.4, 0.08, { x: 0.8, y: 0.7, z: -0.15 });
    box(fb, "#2a2a30", 1.7, 0.1, 0.12, { y: 1.45, z: -0.15 });
    for (let n = 0; n <= 9; n++) {
      this.digits.push(
        canvasTex(128, 160, (g, w, h) => {
          g.fillStyle = "#ffffff";
          g.beginPath();
          g.roundRect(2, 2, w - 4, h - 4, 14);
          g.fill();
          g.fillStyle = "#1d1630";
          g.font = "800 130px Geist, Roboto, sans-serif";
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.fillText(String(n), w / 2, h / 2 + 8);
          g.fillStyle = "rgba(0,0,0,.25)";
          g.fillRect(0, h / 2 - 1, w, 3);
        }),
      );
    }
    for (const k of [0, 1]) {
      const m = new THREE.MeshBasicMaterial({ map: this.digits[0] });
      this.flips.push(m);
      const card = new THREE.Mesh(GEO.plane, m);
      card.scale.set(0.62, 0.78, 1);
      card.position.set(k === 0 ? -0.36 : 0.36, 0.95, -0.08);
      fb.add(card);
      const strip = box(fb, this.players[k].char.color, 0.62, 0.1, 0.03, { x: k === 0 ? -0.36 : 0.36, y: 0.5, z: -0.08 });
      strip.castShadow = false;
    }
    // barriers around the playing area
    const barTex = canvasTex(256, 64, (g, w, h) => {
      g.fillStyle = "#c83a4a";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#ffffff";
      g.font = "800 34px Geist, Roboto, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("PING · PONG", w / 2, h / 2 + 2);
    });
    const barMat = new THREE.MeshToonMaterial({ map: barTex });
    for (let k = -3; k <= 3; k++) {
      const m = new THREE.Mesh(GEO.box, [toon("#a8283a"), toon("#a8283a"), toon("#a8283a"), toon("#a8283a"), barMat, barMat]);
      m.scale.set(2.1, 0.55, 0.06);
      m.position.set(k * 2.15, 0.28, -4.6);
      m.castShadow = true;
      s.add(m);
    }
    // spectators on benches
    const shirts = ["#ff7a59", "#5ab0ff", "#ffd23f", "#7bd389", "#c78bff", "#ff9ad5", "#f4f4f4", "#5ad1c9"];
    const skins = ["#ffd2b0", "#e8b48a", "#c98d62", "#8a5a3a"];
    box(s, "#9a6a3a", 14, 0.45, 0.7, { y: 0.22, z: -5.6 });
    for (let k = 0; k < 11; k++) {
      const x = -6.2 + k * 1.24;
      if (Math.abs(x) < 1.1) continue;
      const g = group(s, { x, y: 0.45, z: -5.6 });
      const body = new THREE.Mesh(GEO.capsule, toon(shirts[k % shirts.length]));
      body.scale.set(0.52, 0.55, 0.42);
      body.position.y = 0.5;
      body.castShadow = true;
      g.add(body);
      ball(g, skins[k % 4], 0.23, { y: 1.03, lo: true });
      if (k % 3 === 1) cyl(g, "#2f8dff", 0.24, 0.12, { y: 1.2, seg: 10 });
      this.crowd.push({ g, ph: Math.random() * 6 });
    }
    // a second table, folded, and a ball basket for the camp feel
    const ft = group(s, { x: -10.5, z: -5 });
    box(ft, "#2a7ab8", 0.08, 2.4, 2.6, { y: 1.3, rz: 0.08 });
    box(ft, "#3a3a46", 0.5, 0.06, 2.0, { y: 0.1 });
    const bk = group(s, { x: 9.5, z: -4.2 });
    cyl(bk, "#3a3a46", 0.45, 0.7, { y: 0.35, rTop: 0.5, seg: 12 });
    for (let k = 0; k < 9; k++) ball(bk, k % 2 ? "#ffffff" : "#ff8a2e", 0.11, { x: Math.cos(k * 1.7) * 0.28, y: 0.72 + (k % 3) * 0.06, z: Math.sin(k * 1.7) * 0.28, lo: true });
    // the ball and its shadow
    this.ballMesh = ball(s, toon("#ff8a2e", "#ff6a00", 0.25), BR);
    this.shadow = blobShadow(BR * 1.4, 0.5);
    s.add(this.shadow);
  }

  // ------------------------------------------------------------ serve / points

  private setupServe() {
    this.phase = "serve";
    this.phaseT = 0;
    this.hitter = -1;
    this.bounces = [0, 0];
    this.hits = 0;
    this.cpuServeAt = 0.7 + Math.random() * 0.6;
    this.players.forEach((p, i) => this.hud.mark(p.seat, "hot", i === this.server));
    if (!this.players[this.server].cpu) this.hud.tip(T(`Your serve: <span class="key a">A</span>`, `轮到你发球：<span class="key a">A</span>`));
  }

  private point(winner: number, why: string) {
    if (this.phase === "point") return;
    this.phase = "point";
    this.phaseT = 0;
    const me = this.pl[winner];
    me.score++;
    this.hud.setScore(this.players[winner].seat, String(me.score));
    this.flips[winner].map = this.digits[Math.min(9, me.score)];
    this.flips[winner].needsUpdate = true;
    this.cheer = 1;
    this.sound("cheer");
    this.sound(me.score >= TARGET ? "fanfare" : "ding");
    this.buzz(winner, 60);
    const done = me.score >= TARGET;
    const match = !done && me.score === TARGET - 1;
    const who = this.players[winner].name;
    this.hud.banner(done ? T(`${who} wins!`, `${who} 获胜！`) : T(`Point to ${who}`, `${who} 得分`), { color: this.players[winner].char.color, size: done ? 8 : 5.5, sub: done ? undefined : match ? `${why} · ${T("Match point!", "赛点！")}` : why });
    this.avatars[winner].anim = "win";
    this.avatars[1 - winner].anim = "lose";
    this.fx.confetti({ x: this.side(winner) * (HIT_X + 0.3), y: 2.2, z: 0 }, 30);
    this.serveCount++;
    if (this.serveCount % 2 === 0) this.server = 1 - this.server;
  }

  // ------------------------------------------------------------ shots

  /**
   * Hit from the ball's current position toward the other half: `e` = timing (-1 late … 1 early)
   * decides the side, `speed` (-1 soft … 1 hard) the pace, `spin` the kick after the bounce.
   */
  private shoot(i: number, e: number, speed: number, spin: number) {
    const b = this.b;
    const sd = this.side(i);
    // early → to the hitter's left, late → to the right (player 0's left is -z, player 1's is +z)
    // the extreme timings give the sharpest angles… and can go wide
    const ee = clamp(e, -1, 1);
    const wide = Math.abs(ee) > 0.8 ? (Math.abs(ee) - 0.8) * 2.6 : 0;
    const tz = Math.sign(ee) * (Math.abs(ee) * (TW - 0.2) + wide) * (i === 0 ? -1 : 1);
    const depth = 0.5 + 0.3 * Math.random() + 0.12 * speed;
    const tx = -sd * TL * clamp(depth, 0.35, 0.92);
    // the arc: a lower apex is a faster ball (a smash skims the net, a soft ball floats)
    const y0 = b.y;
    const floorY = TH + BR;
    const apex = Math.max(TH + (speed > 0 ? 0.4 : speed < 0 ? 0.95 : 0.62), y0 + 0.08);
    const fly = Math.sqrt((2 * (apex - y0)) / G) + Math.sqrt((2 * (apex - floorY)) / G);
    b.vx = (tx - b.x) / fly;
    b.vz = (tz - b.z) / fly;
    b.vy = (floorY - y0 + 0.5 * G * fly * fly) / fly;
    b.spin = spin;
    this.hitter = i;
    this.bounces = [0, 0];
    this.hits++;
    this.sound("pop");
    this.sound("click");
    const p = this.pl[i];
    p.swing = 0.25;
    p.cd = 0.3;
    this.buzz(i, 25);
    this.fx.burst({ x: b.x, y: b.y, z: b.z }, { count: speed > 0.5 ? 12 : 6, colors: ["#ffffff", "#ffe14a"], speed: 2.5 + 2 * speed, size: 0.05, life: 0.3, shape: "ball" });
    if (speed > 0.6) {
      this.hud.pop(new THREE.Vector3(b.x, b.y + 0.7, b.z), T("SMASH!", "扣杀！"), "#ffe14a", this.camera);
      this.shake = 0.12;
    } else if (Math.abs(spin) > 0.5) this.hud.pop(new THREE.Vector3(b.x, b.y + 0.7, b.z), T("Spin!", "旋转球！"), "#9fe8ff", this.camera);
  }

  private inReach(i: number) {
    const b = this.b;
    const p = this.pl[i];
    const sd = this.side(i);
    if (this.phase !== "rally" || this.hitter === i || this.bounces[i] !== 1) return false;
    return Math.abs(b.x - this.paddleX(i)) < REACH_X && Math.abs(b.z - p.z) < REACH_Z && b.y > TH - 0.15 && b.y < TH + 1.5 && b.vx * sd > -0.5;
  }
  private paddleX(i: number) {
    return this.pl[i].x - this.side(i) * 0.3;
  }
  /** Timing: 1 = very early (ball still in front), -1 = late. */
  private timing(i: number) {
    return clamp(((this.b.x - this.paddleX(i)) * -this.side(i)) / REACH_X, -1, 1);
  }

  // ------------------------------------------------------------ CPUs

  /** Where the ball will cross our hitting line (after its bounce on our side). */
  private predict(i: number) {
    const sd = this.side(i);
    let { x, y, z, vx, vy, vz, spin } = this.b;
    let bounced = this.bounces[i];
    const hx = this.pl[i].x - sd * 0.3;
    for (let k = 0; k < 200; k++) {
      const dt = 1 / 60;
      vy -= G * dt;
      x += vx * dt;
      y += vy * dt;
      z += vz * dt;
      if (y < TH + BR && Math.abs(x) < TL && Math.abs(z) < TW && vy < 0) {
        y = TH + BR;
        vy = -vy * 0.8;
        if (x * sd > 0) {
          bounced++;
          vz += spin * 2.2;
        }
      }
      if (bounced >= 1 && (x - hx) * sd > -0.25) return { x, y, z, t: k * dt };
      if (y < 0) break;
    }
    return { x, y, z, t: 2 };
  }

  protected cpu(i: number, dt: number): CpuPad {
    const me = this.pl[i];
    const lv = this.players[i].level;
    const sd = this.side(i);
    const b = this.b;
    if (this.phase === "point") return {};
    if (this.phase === "serve") {
      if (i !== this.server) return this.moveTo(me, sd * (HIT_X + 0.4), 0);
      if (this.phaseT > this.cpuServeAt) return { a: true };
      return {};
    }
    const incoming = this.hitter !== i && this.hitter >= 0;
    if (!incoming) {
      // after our shot: back to the middle
      return this.moveTo(me, sd * (HIT_X + 0.4), 0);
    }
    // a new ball to return: decide how
    if (me.seen !== this.hits) {
      me.seen = this.hits;
      me.errZ = (Math.random() - 0.5) * (1 - lv) * 1.3;
      // aim away from the opponent: early/late picks the side
      const o = this.pl[1 - i];
      const wantZ = o.z > 0 ? -1 : 1; // the side far from them
      const eSide = (i === 0 ? -1 : 1) * wantZ; // timing sign that sends it there
      me.e = Math.random() < 0.35 + 0.5 * lv ? eSide * (0.35 + 0.4 * Math.random()) : (Math.random() - 0.5) * 1.3;
      // a late hit needs a margin: the ball is about to pass
      if (me.e < 0) me.e *= 0.8;
      me.speed = Math.random() < 0.15 + 0.35 * lv ? 1 : Math.random() < 0.2 ? -1 : 0;
      me.spin = Math.random() < 0.15 + 0.35 * lv ? (Math.random() < 0.5 ? -1 : 1) : 0;
      // under pressure (a smash, some spin), even a good player can miss
      const pressure = (Math.abs(b.vx) > 9.5 ? 0.15 : 0) + (b.spin !== 0 ? 0.08 : 0) + (Math.abs(b.vz) > 1.5 ? 0.05 : 0);
      me.botch = Math.random() < 0.06 + 0.22 * (1 - lv) + pressure * (1.3 - lv);
      if (me.botch) {
        const r = Math.random();
        if (r < 0.4) me.e = Math.random() < 0.5 ? -1.15 : 1.15; // too early / too late: wide
        else if (r < 0.65) me.speed = 2; // a smash on a low ball
        else me.errZ += (Math.random() < 0.5 ? -1 : 1) * 1.2; // badly placed: misses it
      }
      this.cpuReset(i, "react");
    }
    if (!this.cpuAfter(i, "react", 0.3 - 0.22 * lv)) return {};
    const p = this.predict(i);
    const mv = this.moveTo(me, sd * (HIT_X + 0.4), clamp(p.z + me.errZ, -TW - 0.4, TW + 0.4));
    // press when the ball reaches the planned timing point (with a little error)
    if (this.inReach(i) && me.cd <= 0) {
      const tm = this.timing(i);
      const jitter = (Math.random() - 0.5) * (1 - lv) * 0.6;
      if (tm <= me.e + jitter + 0.05) {
        const hard = me.speed > 1 || (me.speed > 0 && b.y > TH + 0.35);
        return { a: true, x: hard ? -sd : me.speed < 0 ? sd : 0, y: me.spin };
      }
    }
    return mv;
  }

  private moveTo(me: Pl, tx: number, tz: number): CpuPad {
    const dx = tx - me.x,
      dz = tz - me.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.06) return {};
    const k = Math.min(1, d * 3) / d;
    return { x: dx * k, y: dz * k };
  }

  // ------------------------------------------------------------ the game

  protected idle(dt: number) {
    this.moveCam([0, 3.5, 7.4], [0, 0.85, -0.2], dt, 1.6);
    this.placeAll(dt);
    this.drawBall();
    this.animateCrowd(dt);
  }

  protected step(dt: number) {
    const left = TIME - this.t;
    this.hud.timer(left);
    this.phaseT += dt;
    if (!this.hurried && left <= 10) {
      this.hurried = true;
      this.hud.banner(T("10 SECONDS LEFT!", "还剩 10 秒！"), { color: "#ffd23f", size: 6 });
      music.speed(1.15);
      this.sound("bell");
    }
    // players
    this.players.forEach((_, i) => {
      const me = this.pl[i];
      const pad = this.pad(i);
      const sd = this.side(i);
      me.swing = Math.max(0, me.swing - dt);
      me.cd = Math.max(0, me.cd - dt);
      if (pad.aDown) {
        me.buf = 0.15;
        me.early = !this.inReach(i);
      }
      const frozen = this.phase === "point" || (this.phase === "serve" && i === this.server);
      const k = 1 - Math.exp(-12 * dt);
      me.vx += ((frozen ? 0 : pad.x) * SPEED - me.vx) * k;
      me.vz += ((frozen ? 0 : pad.y) * SPEED - me.vz) * k;
      me.x += me.vx * dt;
      me.z += me.vz * dt;
      // behind your own end of the table
      const near = TL + 0.55,
        far = TL + 2.2;
      me.x = sd < 0 ? clamp(me.x, -far, -near) : clamp(me.x, near, far);
      me.z = clamp(me.z, -TW - 0.9, TW + 0.9);
      if (this.phase === "point" && this.phaseT > 1.1) {
        // walk back into place
        me.x = damp(me.x, sd * (HIT_X + 0.4), 3, dt);
        me.z = damp(me.z, 0, 3, dt);
      }
      // a hit (a press a little early waits for the ball), or a swing in the air
      if (me.buf > 0) {
        me.buf -= dt;
        if (this.phase === "rally" && me.cd <= 0 && this.inReach(i)) {
          me.buf = 0;
          const fwd = -pad.x * sd; // toward the table = +
          const speed = fwd > 0.5 ? 1 : fwd < -0.5 ? -1 : 0;
          const spin = Math.abs(pad.y) > 0.5 ? Math.sign(pad.y) : 0;
          this.shoot(i, me.early ? Math.min(0.65, this.timing(i)) : this.timing(i), speed, spin);
        } else if (me.buf <= 0) {
          me.buf = 0;
          if (this.phase === "rally" && me.cd <= 0) {
            me.swing = 0.25;
            me.cd = 0.2;
            this.sound("swing");
          }
        }
      }
    });
    if (this.phase === "serve") {
      const s = this.pl[this.server];
      const sd = this.side(this.server);
      const b = this.b;
      b.x = s.x - sd * 0.45;
      b.z = s.z + 0.25;
      b.y = TH + 0.35 + Math.abs(Math.sin(this.phaseT * 3.4)) * 0.45;
      b.vx = b.vy = b.vz = 0;
      const pad = this.pad(this.server);
      if ((pad.aDown && this.phaseT > 0.35) || this.phaseT > 3) {
        this.phase = "rally";
        this.phaseT = 0;
        this.hud.tip(null);
        this.shoot(this.server, (Math.random() - 0.5) * 1.2, 0, 0);
      }
    } else if (this.phase === "rally") this.stepBall(dt);
    else if (this.phase === "point") {
      const b = this.b;
      if (b.y > BR) {
        b.vy -= G * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.z += b.vz * dt;
        if (b.y < BR) {
          b.y = BR;
          b.vy = Math.abs(b.vy) > 1 ? -b.vy * 0.5 : 0;
          b.vx *= 0.7;
          b.vz *= 0.7;
        }
      }
      if (this.phaseT > 1.8) {
        if (this.pl[0].score >= TARGET || this.pl[1].score >= TARGET) this.end();
        else this.setupServe();
      }
    }
    this.placeAll(dt);
    this.drawBall();
    this.animateCrowd(dt);
    const lx = this.phase === "rally" ? clamp(this.b.x * 0.12, -0.5, 0.5) : 0;
    this.moveCam([lx, 3.5, 7.4], [lx, 0.85, -0.2], dt, 2);
    if (left <= 0) this.end();
  }

  private stepBall(dt: number) {
    const b = this.b;
    const px = b.x;
    b.vy -= G * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    // the net
    if (Math.sign(px) !== Math.sign(b.x) && px !== 0 && Math.abs(b.z) < TW + 0.15 && b.y < TH + NH + BR * 0.5 && b.y > TH - 0.05) {
      b.x = Math.sign(px) * 0.06;
      b.vx = -b.vx * 0.15;
      b.vz *= 0.3;
      b.vy = Math.min(b.vy, 0);
      this.sound("thud");
      this.hud.pop(new THREE.Vector3(0, TH + NH + 0.5, b.z), T("Net!", "触网！"), "#ff8a7a", this.camera);
    }
    // the table
    if (b.y < TH + BR && b.vy < 0 && Math.abs(b.x) < TL && Math.abs(b.z) < TW && b.y > TH - 0.2) {
      b.y = TH + BR;
      b.vy = -b.vy * 0.8;
      const sideOf = b.x < 0 ? 0 : 1;
      this.bounces[sideOf]++;
      this.sound("tick");
      this.fx.ring({ x: b.x, y: TH + 0.005, z: b.z }, "#ffffff", 0.35, 0.25);
      if (sideOf === this.hitter) return this.point(1 - this.hitter, T("Fault!", "失误！"));
      if (this.bounces[sideOf] >= 2) return this.point(this.hitter, T("Missed it!", "没接住！"));
      b.vz += b.spin * 2.2;
      b.spin = 0;
    }
    // the floor: out, or a missed return
    if (b.y < BR + 0.02) {
      b.y = BR;
      this.sound("land");
      const recv = 1 - this.hitter;
      if (this.bounces[recv] >= 1) this.point(this.hitter, T("Missed it!", "没接住！"));
      else this.point(recv, T("Out!", "出界！"));
      b.vy = Math.abs(b.vy) * 0.5;
      return;
    }
    // flew far behind the receiver without them hitting it
    if (Math.abs(b.x) > TL + 3.2) {
      const recv = 1 - this.hitter;
      if (this.bounces[recv] >= 1) this.point(this.hitter, T("Missed it!", "没接住！"));
      else this.point(recv, T("Out!", "出界！"));
    }
  }

  private end() {
    if (this.ended) return;
    this.ended = true;
    this.hud.tip(null);
    const [a, b] = this.pl.map((p) => p.score);
    if (a === b) this.finish([1, 1]);
    else this.finishByScore([a, b]);
  }

  // ------------------------------------------------------------ drawing

  private placeAll(dt: number) {
    this.players.forEach((_, i) => {
      const a = this.avatars[i];
      const me = this.pl[i];
      a.pos.set(me.x, 0, me.z);
      if (this.phase === "point" && this.phaseT < 1.1) return;
      const sp = Math.hypot(me.vx, me.vz);
      if (me.swing > 0) a.anim = "hit";
      else if (sp > 0.4) {
        a.anim = "run";
        a.speed = clamp(sp / SPEED, 0.2, 1);
      } else a.anim = "idle";
      const sd = this.side(i);
      a.face(sd < 0 ? Math.PI / 2 - 0.25 : -Math.PI / 2 + 0.25, dt, 10);
    });
  }

  /** After the avatars' animation: the paddle arm. */
  private rig() {
    this.players.forEach((_, i) => {
      const a = this.avatars[i];
      const me = this.pl[i];
      if (this.finished) return;
      const arm = i === 0 ? a.rig.armL : a.rig.armR;
      const s = i === 0 ? -1 : 1;
      const sw = me.swing > 0 ? me.swing / 0.25 : 0;
      // ready position: paddle forward at the table's height (a zkSNARK's shoulders are low); a swing sweeps it across
      arm.rotation.x = -1.9 - (1 - sw) * 0.2 + (sw > 0 ? Math.sin(sw * Math.PI) * -0.7 : 0);
      arm.rotation.z = s * (0.5 + (sw > 0 ? (sw - 0.5) * 1.4 : 0));
      const other = i === 0 ? a.rig.armR : a.rig.armL;
      other.rotation.x = -0.6;
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

  private drawBall() {
    const b = this.b;
    this.ballMesh.position.set(b.x, b.y, b.z);
    // the shadow: on the table when above it, on the floor otherwise
    const over = Math.abs(b.x) < TL && Math.abs(b.z) < TW;
    const gy = over ? TH + 0.004 : 0.01;
    this.shadow.position.set(b.x, gy, b.z);
    const h = Math.max(0, b.y - gy);
    this.shadow.scale.setScalar(BR * 2.6 * clamp(1.3 - h * 0.3, 0.5, 1.3));
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = clamp(0.6 - h * 0.25, 0.15, 0.6);
    if (this.phase === "rally" && Math.hypot(b.vx, b.vz) > 7.5) this.fx.burst({ x: b.x, y: b.y, z: b.z }, { count: 1, colors: ["#ffd0a0"], speed: 0.1, gravity: 0, size: 0.08, sizeEnd: 0, life: 0.2, shape: "ball" });
  }

  private animateCrowd(dt: number) {
    this.cheer = Math.max(0, this.cheer - dt * 0.6);
    for (const c of this.crowd) {
      c.ph += dt * (3 + 8 * this.cheer);
      c.g.position.y = 0.45 + Math.abs(Math.sin(c.ph)) * (0.02 + 0.22 * this.cheer);
    }
  }

  protected celebrate(res: MiniResult) {
    this.avatars.forEach((a, i) => (a.anim = res.place[i] === 1 && res.place[1 - i] !== 1 ? "win" : "lose"));
  }

  protected outroStep(dt: number) {
    this.animateCrowd(dt);
    this.avatars.forEach((a) => a.face(0, dt, 4));
    this.moveCam([0, 3.4, 7.4], [0, 0.9, 0], dt, 1.5);
  }
}

const def: MiniDef = {
  id: "ping-pong",
  name: "Ping-Pong",
  icon: "🏓",
  color: "#2fbf8f",
  tagline: "First to 5 points.",
  rules: "Move behind your half and hit (A) once the ball has bounced your side. Early goes left, late goes right. Stick to the table while hitting: a smash; up or down: spin. First to 5 points!",
  controls: { stick: "Move (and smash / spin while hitting)", a: "Hit" },
  modes: ["duel"],
  length: 60,
  music: "mini2",
  create: (ctx) => new PingPong(ctx),
};
export default def;
