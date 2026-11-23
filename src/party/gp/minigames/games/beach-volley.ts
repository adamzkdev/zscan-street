/**
 * BEACH VOLLEY (2 contre 2, premier à 5 points, 60 s max): a sand court between the parasols and
 * the sea. The ball flies in big arcs; a ring on the sand shows where it will land. A = bump: the
 * first touch goes up to your side's front (near the net), the 2nd/3rd sends it over. B = jump: near
 * the net, a jump that meets the ball spikes it down into the other court. The ball touching the sand
 * gives the point to the other team. After 60 s, the score decides (a draw is possible).
 */
import * as THREE from "three";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef } from "../types";
import { GEO, ball, blobShadow, box, canvasTex, cloud, cone, cyl, flat, group, toon } from "../../engine/gfx";
import { clamp } from "../../engine/util";
import { music } from "../../engine/audio";
import { T } from "../../../../i18n/lang";

const TIME = 60;
const TARGET = 5;
const G = 11;
const BR = 0.32;
const NET_H = 2.25;
const CX = 7.6; // court half-length (x)
const CZ = 3.8; // court half-width (z)
const SPEED = 6.8;
const REACH = 1.3;
/** A dive reaches further, for a low ball. */
const DIVE_REACH = 2.3;
const JUMP_T = 0.62;
const JUMP_H = 1.15;
const TEAM_COL = ["#ff5a4e", "#3d8bff"];
/** The teams as ZK PARTY's own Z-BALL CUP names them (team 0 in red, team 1 in blue). */
const teamName = (t: number) => (t === 0 ? T("SHIELDED", "屏蔽队") : T("TRANSPARENT", "透明队"));
const SAND = ["#f3d9a4", "#e8c98a", "#fff1cc"];

interface Pl {
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** Time since the jump started (≥ JUMP_T: on the ground). */
  jt: number;
  spiked: boolean;
  bufA: number;
  bufB: number;
  /** Arms animation lock (bump / spike). */
  act: number;
  /** A dive along the sand (no control until it ends). */
  dive: number;
  /** CPU: -2 no block planned, 0 armed (waiting for their attacker to jump), > 0 jump at this time. */
  blockAt: number;
  /** CPU: dives for this ball if it must. */
  willDive: boolean;
  actAnim: "hold" | "hit" | "throw";
  // CPU
  errX: number;
  errZ: number;
  contact: number;
  jumpPlan: number;
}

interface Ball {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  live: boolean;
  lastTeam: number;
  touches: number;
  lastHitter: number;
  /** No touch possible before this (avoids double hits). */
  noHit: number;
  /** Increments at each touch (CPUs re-plan). */
  id: number;
  fast: boolean;
}

type Phase = "serve" | "rally" | "point";

class BeachVolley extends BaseMini {
  private pl: Pl[] = [];
  private b: Ball = { x: 0, y: 2, z: 0, vx: 0, vy: 0, vz: 0, live: false, lastTeam: -1, touches: 0, lastHitter: -1, noHit: 0, id: 0, fast: false };
  private phase: Phase = "serve";
  private phaseT = 0;
  private score = [0, 0];
  private serveTeam = 0;
  private serveNext = [0, 0];
  private server = 0;
  private serveZ = 0;
  private cpuServeAt = 1;
  private ballMesh!: THREE.Mesh;
  private ballShadow!: THREE.Mesh;
  private marker!: THREE.Mesh;
  private markerMat!: THREE.MeshBasicMaterial;
  private net!: THREE.Group;
  private netWob = 0;
  private sea!: THREE.Texture;
  private scoreEl!: HTMLElement;
  private hurried = false;
  private ended = false;
  private homeSpots: { x: number; z: number }[] = [];

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#3fa9ff", "#ffe9c4"], size: 13, sun: [0.55, 1, 0.45], fog: { near: 45, far: 120 } });
    this.buildBeach();
    this.players.forEach((p, i) => {
      const sd = this.side(p.team);
      const x = sd * (i % 2 === 0 ? 2.8 : 5.6);
      const z = i % 2 === 0 ? 1.5 : -1.5;
      const a = this.spawn(i, x, z, sd < 0 ? Math.PI / 2 : -Math.PI / 2);
      a.setRing(p.char.color);
      this.pl.push({ x, z, vx: 0, vz: 0, jt: JUMP_T, spiked: false, bufA: 0, bufB: 0, act: 0, dive: 0, blockAt: -2, willDive: false, actAnim: "hold", errX: 0, errZ: 0, contact: -1, jumpPlan: -1 });
    });
    const cards = this.hud.players(this.players, (p) => "0", { teams: true });
    [...cards.children].forEach((c, i) => {
      c.classList.remove("tl", "tr", "bl", "br");
      c.classList.add(["tl", "bl", "tr", "br"][i]);
    });
    const u = (n: number) => `calc(var(--u)*${n})`;
    this.scoreEl = this.hud.add(
      `<div style="position:absolute;left:50%;top:${u(7.8)};transform:translateX(-50%);display:flex;align-items:center;gap:${u(0.8)};font-family:var(--title);font-size:${u(3.6)};color:#fff;-webkit-text-stroke:${u(0.3)} #1d1630;paint-order:stroke fill">
        <span style="display:inline-block;min-width:${u(5)};text-align:center;padding:0 ${u(1)};border-radius:${u(1.2)};background:${TEAM_COL[0]};border:${u(0.3)} solid #1d1630" class="s0">0</span>
        <span style="font-size:${u(2.4)}">–</span>
        <span style="display:inline-block;min-width:${u(5)};text-align:center;padding:0 ${u(1)};border-radius:${u(1.2)};background:${TEAM_COL[1]};border:${u(0.3)} solid #1d1630" class="s1">0</span>
      </div>`,
    );
    this.hud.timer(TIME);
    this.serveTeam = this.rnd() < 0.5 ? 0 : 1;
    this.setupServe(true);
    this.setCam([0, 15, 22], [0, 1, -0.5], 42);
  }

  private side(team: number) {
    return team === 0 ? -1 : 1;
  }
  private mateOf(i: number) {
    return this.players.findIndex((p, j) => j !== i && p.team === this.players[i].team);
  }

  // ------------------------------------------------------------ the beach

  private buildBeach() {
    const s = this.scene;
    const sandTex = canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = "#f3d9a4";
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 1400; i++) {
        g.fillStyle = SAND[i % 3];
        g.globalAlpha = 0.5;
        g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 3, 2 + Math.random() * 3);
      }
      g.globalAlpha = 0.12;
      g.strokeStyle = "#c9a060";
      g.lineWidth = 6;
      for (let i = 0; i < 10; i++) {
        g.beginPath();
        const y = Math.random() * h;
        g.moveTo(0, y);
        g.bezierCurveTo(w * 0.3, y + 30, w * 0.6, y - 30, w, y + 10);
        g.stroke();
      }
    }, true);
    sandTex.repeat.set(6, 6);
    const sand = new THREE.Mesh(new THREE.PlaneGeometry(90, 34), new THREE.MeshToonMaterial({ map: sandTex }));
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(0, 0, 3);
    sand.receiveShadow = true;
    s.add(sand);
    // wet sand and foam, then the sea
    const wet = new THREE.Mesh(GEO.plane, toon("#d9b77a"));
    wet.rotation.x = -Math.PI / 2;
    wet.scale.set(90, 3, 1);
    wet.position.set(0, 0.005, -13.2);
    s.add(wet);
    this.sea = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = "#2fa6e0";
      g.fillRect(0, 0, w, h);
      g.strokeStyle = "rgba(255,255,255,0.35)";
      g.lineWidth = 4;
      for (let y = 8; y < h; y += 32) {
        g.beginPath();
        for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin((x / w) * Math.PI * 4) * 5);
        g.stroke();
      }
    }, true);
    this.sea.repeat.set(10, 4);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(240, 90), new THREE.MeshToonMaterial({ map: this.sea, color: "#ffffff" }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, -0.05, -59);
    s.add(sea);
    const foam = new THREE.Mesh(GEO.plane, flat("#ffffff", 0.85));
    foam.rotation.x = -Math.PI / 2;
    foam.scale.set(90, 0.7, 1);
    foam.position.set(0, 0.01, -14.6);
    foam.name = "foam";
    s.add(foam);
    // the court: lines (blue straps) and the net
    const line = flat("#2a6fd6");
    for (const sz of [-1, 1]) box(s, line, CX * 2 + 0.2, 0.03, 0.1, { z: sz * CZ, y: 0.02, cast: false });
    for (const sx of [-1, 1]) box(s, line, 0.1, 0.03, CZ * 2 + 0.1, { x: sx * CX, y: 0.02, cast: false });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cone(s, "#ff8a2e", 0.13, 0.32, { x: sx * CX, z: sz * CZ, y: 0.16, lo: true });
    this.net = group(s);
    const netTex = canvasTex(256, 64, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.strokeStyle = "#1d1d28";
      g.lineWidth = 3;
      for (let x = 0; x <= w; x += 12) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, h);
        g.stroke();
      }
      for (let y = 0; y <= h; y += 12) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y);
        g.stroke();
      }
    }, true);
    netTex.repeat.set(4, 1);
    const NZ = CZ + 0.5;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(NZ * 2, 1.05), new THREE.MeshToonMaterial({ map: netTex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide }));
    mesh.rotation.y = Math.PI / 2;
    mesh.position.y = NET_H - 0.55;
    mesh.castShadow = true;
    this.net.add(mesh);
    box(this.net, "#ffffff", 0.12, 0.14, NZ * 2, { y: NET_H - 0.02 });
    box(this.net, "#ffffff", 0.06, 0.06, NZ * 2, { y: NET_H - 1.08 });
    for (const sz of [-1, 1]) {
      cyl(s, "#e8e8f0", 0.09, NET_H + 0.3, { z: sz * (NZ + 0.05), y: (NET_H + 0.3) / 2, seg: 10 });
      ball(s, "#ff4b3e", 0.13, { z: sz * (NZ + 0.05), y: NET_H + 0.35 });
      for (let k = 0; k < 4; k++) cyl(this.net, k % 2 ? "#ffffff" : "#ff4b3e", 0.03, 0.22, { z: sz * CZ, y: NET_H + 0.12 + k * 0.22, seg: 6 });
    }
    // the referee's chair
    const rc = group(s, { z: -NZ - 1.3 });
    for (const [x, z] of [
      [-0.35, -0.35],
      [0.35, -0.35],
      [-0.35, 0.35],
      [0.35, 0.35],
    ])
      cyl(rc, "#ffffff", 0.05, 2.2, { x, z, y: 1.1, seg: 6 });
    box(rc, "#2f8dff", 0.9, 0.12, 0.9, { y: 2.2 });
    box(rc, "#2f8dff", 0.9, 0.7, 0.1, { y: 2.6, z: -0.42 });
    // parasols, towels, palms, a lifeguard tower
    const stripes = (a: string, b: string) =>
      canvasTex(256, 32, (g, w, h) => {
        for (let i = 0; i < 12; i++) {
          g.fillStyle = i % 2 ? a : b;
          g.fillRect((i * w) / 12, 0, w / 12 + 1, h);
        }
      });
    const paraMats = [new THREE.MeshToonMaterial({ map: stripes("#ff4b3e", "#ffffff") }), new THREE.MeshToonMaterial({ map: stripes("#2f8dff", "#ffffff") }), new THREE.MeshToonMaterial({ map: stripes("#ffd23f", "#ff7ad9") }), new THREE.MeshToonMaterial({ map: stripes("#3fcf5a", "#ffffff") })];
    const paraGeo = new THREE.ConeGeometry(1.6, 0.7, 12, 1, true);
    const parasol = (x: number, z: number, k: number, tilt = 0) => {
      const g = group(s, { x, z, rz: tilt });
      cyl(g, "#f4f4f4", 0.05, 2.6, { y: 1.3, seg: 6 });
      const top = new THREE.Mesh(paraGeo, paraMats[k % 4]);
      (top.material as THREE.MeshToonMaterial).side = THREE.DoubleSide;
      top.position.y = 2.65;
      top.castShadow = true;
      g.add(top);
      ball(g, "#ffffff", 0.08, { y: 3.02 });
    };
    const towel = (x: number, z: number, c: string, ry: number) => {
      const g = group(s, { x, z, ry });
      box(g, c, 1.0, 0.03, 2.0, { y: 0.02, cast: false });
      box(g, "#ffffff", 1.0, 0.035, 0.15, { y: 0.02, z: 0.6, cast: false });
      box(g, "#ffffff", 1.0, 0.035, 0.15, { y: 0.02, z: -0.6, cast: false });
    };
    parasol(-11.5, -6.5, 0, 0.08);
    towel(-10.8, -5.6, "#ff7ad9", 0.3);
    parasol(-14.5, -2.5, 1, -0.06);
    towel(-13.6, -1.6, "#3fcf5a", -0.2);
    parasol(11.8, -6.8, 2, -0.08);
    towel(11, -5.8, "#2f8dff", -0.4);
    parasol(14.6, -2, 3, 0.07);
    towel(13.8, -1.2, "#ffd23f", 0.2);
    parasol(-4.8, -9.5, 2, 0.05);
    parasol(5.2, -9.8, 0, -0.05);
    towel(-4.2, -8.6, "#ff9a2e", 0.1);
    // a beach ball and a cooler
    const bb = ball(s, "#ffffff", 0.35, { x: -9.5, y: 0.35, z: -4 });
    bb.material = new THREE.MeshToonMaterial({ map: stripes("#ff4b3e", "#ffd23f") });
    box(s, "#2f8dff", 0.7, 0.5, 0.45, { x: 10.3, y: 0.25, z: -4.6 });
    box(s, "#ffffff", 0.74, 0.12, 0.49, { x: 10.3, y: 0.55, z: -4.6 });
    const palm = (x: number, z: number, h: number, lean: number) => {
      const g = group(s, { x, z, rz: lean });
      for (let k = 0; k < 6; k++) cyl(g, k % 2 ? "#a8784a" : "#94683e", 0.2 - k * 0.015, h / 6 + 0.05, { y: (k + 0.5) * (h / 6), x: Math.sin(k * 0.3) * 0.1, seg: 8 });
      const top = group(g, { y: h });
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        const leaf = group(top, { ry: a });
        const l = box(leaf, k % 2 ? "#3fae4a" : "#2f9a3e", 0.5, 0.06, 2.2, { z: 1.0, y: -0.25, rx: 0.45 });
        l.castShadow = true;
      }
      for (let k = 0; k < 3; k++) ball(top, "#6a4a2a", 0.16, { x: Math.cos(k * 2) * 0.2, y: -0.2, z: Math.sin(k * 2) * 0.2, lo: true });
    };
    palm(-17, -8, 6.5, 0.12);
    palm(-19.5, -1, 5.5, -0.1);
    palm(17.5, -8.5, 6.8, -0.14);
    palm(20, -1.5, 5.8, 0.1);
    palm(-8.5, -12, 6.2, 0.05);
    palm(8.8, -12.5, 6, -0.08);
    // lifeguard tower on the right
    const lt = group(s, { x: 15.5, z: -11 });
    for (const [x, z] of [
      [-0.8, -0.8],
      [0.8, -0.8],
      [-0.8, 0.8],
      [0.8, 0.8],
    ])
      cyl(lt, "#ffffff", 0.08, 3, { x, z, y: 1.5, seg: 6 });
    box(lt, "#ff4b3e", 2.0, 1.2, 2.0, { y: 3.6 });
    box(lt, "#ffffff", 2.3, 0.15, 2.3, { y: 4.3 });
    box(lt, "#ffd23f", 1.4, 0.5, 0.05, { y: 3.7, z: 1.02 });
    // dunes and clouds far away
    for (let k = 0; k < 6; k++) ball(s, "#efd29a", [6, 1.6, 3], { x: -40 + k * 16, y: -0.4, z: 16 + (k % 2) * 3, lo: true, cast: false });
    cloud(s, -18, 13, -45, 2.6);
    cloud(s, 10, 16, -55, 3);
    cloud(s, 30, 12, -40, 2);
    // the ball (volleyball panels), its shadow and the landing ring
    const vtex = canvasTex(256, 128, (g, w, h) => {
      const cols = ["#ffd23f", "#2f8dff", "#ffffff"];
      for (let i = 0; i < 6; i++) {
        g.fillStyle = cols[i % 3];
        g.fillRect(0, (i * h) / 6, w, h / 6 + 1);
      }
      g.strokeStyle = "#1d1630";
      g.lineWidth = 2;
      for (let i = 1; i < 6; i++) {
        g.beginPath();
        g.moveTo(0, (i * h) / 6);
        g.lineTo(w, (i * h) / 6);
        g.stroke();
      }
    });
    this.ballMesh = new THREE.Mesh(GEO.sphere, new THREE.MeshToonMaterial({ map: vtex }));
    this.ballMesh.scale.setScalar(BR);
    this.ballMesh.castShadow = true;
    s.add(this.ballMesh);
    this.ballShadow = blobShadow(BR * 1.1, 0.45);
    s.add(this.ballShadow);
    this.markerMat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.8, depthWrite: false });
    this.marker = new THREE.Mesh(GEO.ring, this.markerMat);
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.renderOrder = 3;
    s.add(this.marker);
  }

  // ------------------------------------------------------------ serve / points

  /** Who serves next and where everyone stands for it. */
  private planServe() {
    const TM = this.serveTeam;
    const mates = this.players.filter((p) => p.team === TM).map((p) => p.i);
    this.server = mates[this.serveNext[TM] % 2];
    this.serveNext[TM]++;
    this.serveZ = (this.rnd() - 0.5) * 3;
    this.homeSpots = this.players.map((p, i) => {
      const s = this.side(p.team);
      if (i === this.server) return { x: s * 7.9, z: this.serveZ };
      if (p.team === TM) return { x: s * 2.6, z: -Math.sign(this.serveZ || 1) * 1.4 };
      const front = i % 2 === 0;
      return { x: s * (front ? 2.9 : 5.6), z: front ? 1.6 : -1.4 };
    });
  }

  private setupServe(first = false) {
    const TM = this.serveTeam;
    if (first) {
      this.planServe();
      this.homeSpots.forEach((h, i) => {
        this.pl[i].x = h.x;
        this.pl[i].z = h.z;
      });
    }
    this.phase = "serve";
    this.phaseT = 0;
    this.cpuServeAt = 0.8 + Math.random() * 0.8;
    this.b.live = false;
    this.b.lastTeam = TM;
    this.b.touches = 0;
    this.b.lastHitter = -1;
    this.b.fast = false;
    this.b.vx = this.b.vy = this.b.vz = 0;
    if (!this.players[this.server].cpu) this.hud.tip(T(`<b style="color:${this.players[this.server].char.color}">${this.players[this.server].name}</b> to serve: press <span class="key a">A</span>`, `<b style="color:${this.players[this.server].char.color}">${this.players[this.server].name}</b> 发球：按 <span class="key a">A</span>`));
  }

  private serve() {
    const i = this.server;
    const TM = this.players[i].team;
    const b = this.b;
    const me = this.pl[i];
    b.x = me.x + this.side(TM) * -0.2;
    b.y = 2.3;
    b.z = me.z;
    const tgt = this.aim(TM, false, 0.5);
    this.launchOver(tgt.x, tgt.z, 1.55);
    b.live = true;
    b.lastTeam = TM;
    b.touches = 3;
    b.lastHitter = i;
    b.noHit = 0.3;
    b.id++;
    this.phase = "rally";
    this.phaseT = 0;
    this.act(i, "throw");
    this.sound("whoosh");
    this.sound("pop");
    this.hud.tip(null);
  }

  private point(winner: number) {
    const b = this.b;
    b.live = false;
    this.score[winner]++;
    this.phase = "point";
    this.phaseT = 0;
    this.players.forEach((p) => this.hud.setScore(p.seat, String(this.score[p.team])));
    (this.scoreEl.querySelector(`.s${winner}`) as HTMLElement).textContent = String(this.score[winner]);
    const el = this.scoreEl.firstElementChild as HTMLElement;
    el.style.transition = "transform .25s";
    el.style.transform = "translateX(-50%) scale(1.3)";
    setTimeout(() => (el.style.transform = "translateX(-50%)"), 250);
    const sd = this.side(winner);
    this.fx.confetti({ x: sd * 4, y: 3, z: 0 }, 50);
    this.sound("cheer");
    this.sound("ding");
    const close = this.score[winner] === TARGET - 1 && this.score[1 - winner] < TARGET - 1;
    if (this.score[winner] >= TARGET) {
      this.hud.banner(T(`${teamName(winner)} WIN!`, `${teamName(winner)}获胜！`), { color: TEAM_COL[winner], sub: `${this.score[0]} – ${this.score[1]}` });
    } else this.hud.banner(T(`${teamName(winner)} SCORE!`, `${teamName(winner)}得分！`), { color: TEAM_COL[winner], size: 6.5, sub: close ? T("Match point!", "赛点！") : undefined });
    this.players.forEach((p, i) => {
      this.avatars[i].anim = p.team === winner ? "win" : "lose";
      if (p.team === winner) this.buzz(i, 60);
    });
    this.serveTeam = winner;
    if (this.score[winner] < TARGET) this.planServe();
  }

  // ------------------------------------------------------------ ball physics helpers

  /** Time until the ball comes down to height h (null: never). */
  private tAt(h: number) {
    const b = this.b;
    const disc = b.vy * b.vy + 2 * G * (b.y - h);
    if (disc < 0) return null;
    return (b.vy + Math.sqrt(disc)) / G;
  }
  private at(t: number) {
    const b = this.b;
    return { x: b.x + b.vx * t, z: b.z + b.vz * t, y: b.y + b.vy * t - 0.5 * G * t * t };
  }
  private launch(tx: number, ty: number, tz: number, TM: number) {
    const b = this.b;
    b.vx = (tx - b.x) / TM;
    b.vz = (tz - b.z) / TM;
    b.vy = (ty - b.y + 0.5 * G * TM * TM) / TM;
  }
  /** Height of the ball's path where it crosses the net (Infinity if it does not cross). */
  private netY() {
    const b = this.b;
    if (Math.abs(b.vx) < 1e-3 || Math.sign(b.x) === Math.sign(b.vx) || b.x === 0) return Infinity;
    const t = -b.x / b.vx;
    return b.y + b.vy * t - 0.5 * G * t * t;
  }
  private launchOver(tx: number, tz: number, T0: number) {
    let TM = T0;
    for (; TM < 2.6; TM += 0.08) {
      this.launch(tx, BR, tz, TM);
      if (this.netY() > NET_H + 0.55) break;
    }
  }

  /** A good spot in the other court: away from the defenders (q: 0 random … 1 sharp). */
  private aim(TM: number, spike: boolean, q: number, zBias: number | null = null) {
    const os = -this.side(TM);
    let best = { x: os * 4, z: 0 },
      bs = -1e9;
    for (let k = 0; k < 14; k++) {
      const x = os * (spike ? 1.8 + Math.random() * 4.8 : 2.2 + Math.random() * 5);
      const z = (Math.random() * 2 - 1) * (CZ - 0.5);
      let dmin = 99;
      this.players.forEach((p, j) => {
        if (p.team === TM) return;
        dmin = Math.min(dmin, Math.hypot(x - this.pl[j].x, z - this.pl[j].z));
      });
      const sc = dmin - (zBias !== null ? Math.abs(z - zBias) * 0.7 : 0) + Math.random() * (1 - q) * 3.5;
      if (sc > bs) {
        bs = sc;
        best = { x, z };
      }
    }
    return best;
  }

  /** A defender of `team` in the air at the net, right where the ball crosses: a block. */
  private tryBlock(team: number) {
    const b = this.b;
    for (let i = 0; i < 4; i++) {
      if (this.players[i].team !== team) continue;
      const me = this.pl[i];
      const jy = this.jumpY(me);
      if (jy < 0.45 || Math.abs(me.x) > 1.3 || Math.abs(me.z - b.z) > 0.75 || b.y > jy + 2.35) continue;
      const sd = this.side(team);
      b.x = -sd * (BR + 0.1);
      b.vx = -sd * (2 + Math.random() * 2);
      b.vy = 2.5;
      b.vz = (Math.random() - 0.5) * 2;
      b.lastTeam = team;
      b.touches = 1;
      b.lastHitter = i;
      b.noHit = 0.15;
      b.fast = false;
      b.id++;
      me.spiked = true;
      this.act(i, "hit");
      this.sound("bonk");
      this.sound("hit");
      this.shake = 0.3;
      this.buzz(i, 70);
      this.hud.pop(new THREE.Vector3(0, NET_H + 1.4, b.z), T("BLOCK!", "拦网！"), "#ffe14a", this.camera);
      this.fx.burst({ x: 0, y: b.y, z: b.z }, { count: 18, colors: ["#ffffff", "#ffe14a"], speed: 5, size: 0.13, life: 0.4, shape: "ball" });
      return true;
    }
    return false;
  }

  private quality(i: number) {
    return this.players[i].cpu ? 0.25 + 0.7 * this.players[i].level : 0.75;
  }

  private act(i: number, anim: "hold" | "hit" | "throw") {
    this.pl[i].act = 0.32;
    this.pl[i].actAnim = anim;
  }

  private bump(i: number, dive = false) {
    const b = this.b;
    const me = this.pl[i];
    const TM = this.players[i].team;
    const sd = this.side(TM);
    const n = b.lastTeam === TM ? b.touches + 1 : 1;
    const off = Math.min(1.6, Math.hypot(b.x - me.x, b.z - me.z) / REACH); // 0 = perfect, 1 = at the edge
    const q = this.quality(i);
    const err = off * (1.3 - q) * 1.2 + (dive ? 0.8 : 0);
    if (dive) {
      // the dive: a slide along the sand toward the ball
      const dx = b.x - me.x,
        dz = b.z - me.z;
      const l = Math.hypot(dx, dz) || 1;
      me.vx = (dx / l) * 9;
      me.vz = (dz / l) * 9;
      me.dive = 0.75;
      this.fx.burst({ x: me.x, y: 0.1, z: me.z }, { count: 18, colors: SAND, speed: 3, up: 2.5, gravity: 12, size: 0.13, life: 0.6, shape: "ball" });
      this.hud.pop(new THREE.Vector3(me.x, 2, me.z), T("Dive!", "鱼跃！"), "#9fe8ff", this.camera);
      this.sound("whoosh");
    }
    if (n === 1) {
      // up to the front, toward the teammate
      const mate = this.pl[this.mateOf(i)];
      const tx = sd * 1.5 + (Math.random() - 0.5) * err;
      const tz = clamp(mate.z, -2.6, 2.6) * 0.7 + (Math.random() - 0.5) * err * 1.4;
      this.launch(tx, 2.75, tz, 1.25 + Math.random() * 0.1);
      if (!dive) this.hud.pop(new THREE.Vector3(b.x, b.y + 1, b.z), T("Set!", "传球！"), "#ffffff", this.camera);
    } else {
      const zb = this.players[i].cpu ? null : Math.abs(this.pad(i).y) > 0.5 ? this.pad(i).y * 3 : null;
      const tgt = this.aim(TM, false, q, zb);
      this.launchOver(tgt.x + (Math.random() - 0.5) * err, tgt.z + (Math.random() - 0.5) * err, 1.05 + Math.abs(b.x - tgt.x) * 0.045);
    }
    b.lastTeam = TM;
    b.touches = n;
    b.lastHitter = i;
    b.noHit = 0.25;
    b.id++;
    b.fast = false;
    me.bufA = 0;
    this.act(i, "hold");
    this.sound("bonk");
    this.buzz(i, 30);
    this.fx.burst({ x: b.x, y: b.y, z: b.z }, { count: 8, colors: ["#ffffff", "#fff3b0"], speed: 3, size: 0.1, life: 0.35, shape: "ball" });
  }

  private spike(i: number) {
    const b = this.b;
    const me = this.pl[i];
    const TM = this.players[i].team;
    const q = this.quality(i);
    const zb = this.players[i].cpu ? null : Math.abs(this.pad(i).y) > 0.5 ? this.pad(i).y * 3 : null;
    const tgt = this.aim(TM, true, q, zb);
    let Tt = 0.44;
    for (; Tt < 1.2; Tt += 0.04) {
      this.launch(tgt.x, BR, tgt.z, Tt);
      if (this.netY() > NET_H + 0.22) break;
    }
    b.lastTeam = TM;
    b.touches = 3;
    b.lastHitter = i;
    b.noHit = 0.2;
    b.id++;
    b.fast = Tt < 0.7;
    me.spiked = true;
    me.bufB = 0;
    this.act(i, "hit");
    this.sound("hit");
    this.sound("whoosh");
    this.shake = 0.3;
    this.buzz(i, 60);
    this.fx.burst({ x: b.x, y: b.y, z: b.z }, { count: 16, colors: ["#ffffff", "#ffe14a", "#ff9a2e"], speed: 6, size: 0.14, life: 0.4, shape: "ball" });
    this.hud.pop(new THREE.Vector3(b.x, b.y + 0.9, b.z), T("SPIKE!", "扣杀！"), "#ffe14a", this.camera);
  }

  // ------------------------------------------------------------ CPUs

  protected cpu(i: number, dt: number): CpuPad {
    const me = this.pl[i];
    const p = this.players[i];
    const lv = p.level;
    const TM = p.team;
    const sd = this.side(TM);
    const b = this.b;
    const mi = this.mateOf(i);
    let tx = me.x,
      tz = me.z;
    let a = false,
      bb = false;
    if (this.phase === "point") return {};
    if (this.phase === "serve") {
      if (i === this.server) return { a: this.phaseT > this.cpuServeAt && this.phaseT < this.cpuServeAt + 0.1 };
      const h = this.homeSpots[i];
      return this.toward(me, h.x, h.z);
    }
    // a new touch: re-roll this CPU's error and reaction
    if (me.contact !== b.id) {
      me.contact = b.id;
      const e = (1 - lv) * 1.15;
      me.errX = (Math.random() + Math.random() - 1) * e;
      me.errZ = (Math.random() + Math.random() - 1) * e;
      me.jumpPlan = 0.3 + (Math.random() - 0.5) * (1 - lv) * 0.22;
      me.willDive = Math.random() < 0.3 + 0.6 * lv;
      me.blockAt = Math.random() < 0.15 + 0.35 * lv ? 0 : -2;
      this.cpuReset(i, "react");
    }
    const react = this.cpuAfter(i, "react", 0.42 - 0.34 * lv);
    const tl = this.tAt(BR);
    const land = tl !== null ? this.at(tl) : { x: b.x, z: b.z, y: 0 };
    const ourBall = b.live && (land.x * sd > 0 || (b.x * sd > 0 && b.lastTeam === TM));
    const mine = b.lastTeam === TM ? b.touches : 0;
    if (b.live && ourBall && mine < 3) {
      const t1 = this.tAt(1.0);
      const p1 = t1 !== null ? this.at(t1) : land;
      if (mine === 0 || mine >= 2) {
        // who takes it: the closer one
        const dMe = Math.hypot(p1.x - me.x, p1.z - me.z);
        const dMate = Math.hypot(p1.x - this.pl[mi].x, p1.z - this.pl[mi].z);
        const taker = dMe < dMate - 0.01 || (Math.abs(dMe - dMate) < 0.01 && i < mi);
        if (taker) {
          tx = p1.x + me.errX + sd * 0.25;
          tz = p1.z + me.errZ;
          a = (this.inReach(i) && b.y < 2.1 && (b.vy < 0 || b.y < 1.2)) || (me.willDive && this.inDive(i) && b.y < 0.9);
        } else {
          tx = sd * 1.8;
          tz = clamp(p1.z * 0.4 + (me.z > 0 ? 1 : -1) * 0.8, -2.5, 2.5);
        }
      } else if (mine === 1) {
        if (b.lastHitter === i) {
          tx = sd * 4.8;
          tz = clamp(-this.pl[mi].z, -2.5, 2.5);
        } else {
          // the attacker: get under the set and jump to meet it
          const ts = this.tAt(2.75);
          const ps = ts !== null ? this.at(ts) : land;
          if (ts !== null && Math.abs(ps.x) < 3.4 && ps.x * sd > -0.1) {
            tx = ps.x + sd * 0.3 + me.errX * 0.5;
            tz = ps.z + me.errZ * 0.5;
            if (me.jt >= JUMP_T && ts <= me.jumpPlan && ts > 0.05 && Math.hypot(tx - me.x, tz - me.z) < 1.0) bb = true;
          } else {
            const t1 = this.tAt(1.0);
            const q1 = t1 !== null ? this.at(t1) : land;
            tx = q1.x + me.errX + sd * 0.25;
            tz = q1.z + me.errZ;
            a = this.inReach(i) && b.y < 2.1 && b.vy < 0;
          }
        }
      }
      if (!react) return { a, b: bb };
    } else {
      // defend: one at the front, one at the back
      const front = Math.abs(me.x) < Math.abs(this.pl[mi].x) || (Math.abs(me.x) === Math.abs(this.pl[mi].x) && i < mi);
      tx = sd * (front ? 2.4 : 5.4);
      tz = front ? clamp(b.z * 0.5, -2, 2) + (this.pl[mi].z > me.z ? -0.6 : 0.6) : clamp(b.z * 0.4, -2, 2);
      // they are setting up a spike: the front one goes up to block
      if (front && b.live && b.lastTeam === 1 - TM && b.touches === 1 && b.x * sd < 0 && me.blockAt > -2) {
        const ts = this.tAt(2.75);
        const ps = ts !== null ? this.at(ts) : null;
        if (ps && Math.abs(ps.x) < 3.4) {
          tx = sd * 0.75;
          tz = clamp(ps.z, -CZ, CZ);
          const theyJump = this.players.some((q, j) => q.team !== TM && this.pl[j].jt < 0.12);
          if (me.blockAt === 0 && theyJump) me.blockAt = this.t + 0.05 + Math.random() * 0.14 * (1.3 - lv);
          if (me.blockAt > 0 && this.t >= me.blockAt && me.jt >= JUMP_T) {
            me.blockAt = -2;
            bb = true;
          }
        }
      }
      if (!react) return bb ? { b: true } : {};
    }
    const mv = this.toward(me, tx, tz);
    return { ...mv, a, b: bb };
  }

  private toward(me: Pl, tx: number, tz: number): CpuPad {
    const dx = tx - me.x,
      dz = tz - me.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.12) return {};
    const k = Math.min(1, d * 2.2) / d;
    return { x: dx * k, y: dz * k };
  }

  private inReach(i: number) {
    const b = this.b;
    const me = this.pl[i];
    const TM = this.players[i].team;
    if (!b.live || b.noHit > 0 || b.x * this.side(TM) < -0.15) return false;
    if (b.lastTeam === TM && b.touches >= 3 && b.lastHitter === i) return false;
    const jy = this.jumpY(me);
    return Math.hypot(b.x - me.x, b.z - me.z) <= REACH && b.y >= 0.2 && b.y <= 2.25 + jy;
  }
  /** Too far for a bump, but a dive could save it (a low ball). */
  private inDive(i: number) {
    const b = this.b;
    const me = this.pl[i];
    const TM = this.players[i].team;
    if (!b.live || b.noHit > 0 || b.x * this.side(TM) < -0.15 || me.jt < JUMP_T || me.dive > 0) return false;
    if (b.lastTeam === TM && b.touches >= 3 && b.lastHitter === i) return false;
    const d = Math.hypot(b.x - me.x, b.z - me.z);
    return d > REACH && d <= DIVE_REACH && b.y >= 0.2 && b.y <= 1.2 && b.vy < 0;
  }

  private jumpY(me: Pl) {
    return me.jt < JUMP_T ? Math.sin((me.jt / JUMP_T) * Math.PI) * JUMP_H : 0;
  }

  // ------------------------------------------------------------ the game

  protected idle(dt: number) {
    this.moveCam([0, 9.4, 14.2], [0, 1.1, -0.6], dt, 1.6);
    this.animateWorld(dt);
    this.drawBall(dt);
    this.players.forEach((_, i) => this.placeAvatar(i, dt));
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
    const b = this.b;
    // players
    this.players.forEach((p, i) => {
      const me = this.pl[i];
      const pad = this.pad(i);
      const sd = this.side(p.team);
      me.bufA = pad.aDown ? 0.22 : Math.max(0, me.bufA - dt);
      me.bufB = Math.max(0, me.bufB - dt);
      me.act = Math.max(0, me.act - dt);
      let ix = pad.x,
        iz = pad.y;
      const locked = this.phase === "point" || (this.phase === "serve" && i === this.server);
      if (this.phase === "point") {
        // walk back to the serve spots once the cheering is over
        if (this.phaseT > 1.3) {
          const h = this.homeSpots[i];
          const mv = this.toward(me, h.x, h.z);
          ix = mv.x ?? 0;
          iz = mv.y ?? 0;
        } else ix = iz = 0;
      } else if (locked) ix = iz = 0;
      const air = me.jt < JUMP_T;
      const sp = SPEED * (this.phase === "point" ? 1.4 : 1);
      if (me.dive > 0) {
        me.dive -= dt;
        me.vx *= Math.exp(-4 * dt);
        me.vz *= Math.exp(-4 * dt);
      } else {
        const k = 1 - Math.exp(-(air ? 3 : 14) * dt);
        me.vx += (ix * sp - me.vx) * k;
        me.vz += (iz * sp - me.vz) * k;
      }
      me.x += me.vx * dt;
      me.z += me.vz * dt;
      // own half only
      if (sd < 0) me.x = clamp(me.x, -CX - 1.2, -0.45);
      else me.x = clamp(me.x, 0.45, CX + 1.2);
      me.z = clamp(me.z, -CZ - 0.8, CZ + 0.8);
      if (this.phase === "serve" && i === this.server) {
        me.x = this.homeSpots[i].x;
        me.z = this.homeSpots[i].z;
      }
      // jump
      if (pad.bDown && !air && me.dive <= 0 && this.phase === "rally") {
        me.jt = 0;
        me.spiked = false;
        this.sound("jump");
        this.fx.dust({ x: me.x, y: 0, z: me.z }, 6, "#f3d9a4");
      }
      if (me.jt < JUMP_T) {
        me.jt += dt;
        if (me.jt >= JUMP_T) {
          me.jt = JUMP_T;
          this.fx.dust({ x: me.x, y: 0, z: me.z }, 5, "#f3d9a4");
        }
      }
    });
    if (this.phase === "serve") {
      const srv = this.pl[this.server];
      b.x = srv.x + this.side(this.players[this.server].team) * -0.25;
      b.z = srv.z + 0.35;
      b.y = 1.9 + Math.abs(Math.sin(this.phaseT * 3.2)) * 0.9;
      const pad = this.pad(this.server);
      if ((pad.aDown && this.phaseT > 0.4) || this.phaseT > 3.2) this.serve();
    } else if (this.phase === "rally") {
      // touches
      b.noHit -= dt;
      const order = [0, 1, 2, 3].sort((x, y) => Math.hypot(b.x - this.pl[x].x, b.z - this.pl[x].z) - Math.hypot(b.x - this.pl[y].x, b.z - this.pl[y].z));
      for (const i of order) {
        if (!b.live || b.noHit > 0) break;
        const me = this.pl[i];
        const TM = this.players[i].team;
        const sd = this.side(TM);
        // spike: in the air, the hand meets the ball near the net
        if (me.jt < JUMP_T && me.jt > 0.06 && !me.spiked && b.x * sd > -0.3 && Math.abs(b.x) < 3.8) {
          const hy = this.jumpY(me) + 1.75;
          const d3 = Math.hypot(b.x - me.x, b.y - hy, b.z - me.z);
          if (d3 < 1.05 && !(b.lastTeam === TM && b.touches >= 3 && b.lastHitter === i)) {
            this.spike(i);
            break;
          }
        }
        if (me.bufA > 0 && this.inReach(i)) {
          this.bump(i);
          break;
        }
        if (me.bufA > 0 && this.inDive(i)) {
          this.bump(i, true);
          break;
        }
      }
      // flight
      const px = b.x;
      b.vy -= G * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      if (px !== 0 && Math.sign(px) !== Math.sign(b.x) && Math.abs(b.z) < CZ + 0.6) {
        if (b.y < NET_H + BR * 0.6) {
          // into the net: drops back
          b.x = Math.sign(px) * (BR + 0.05);
          b.vx = -b.vx * 0.18;
          b.vz *= 0.4;
          b.vy = Math.min(b.vy, 0) * 0.4;
          b.fast = false;
          this.netWob = 1;
          this.sound("thud");
          this.hud.pop(new THREE.Vector3(b.x, NET_H + 0.6, b.z), T("Net!", "触网！"), "#ff8a7a", this.camera);
        } else if (this.tryBlock(px < 0 ? 1 : 0)) {
          // blocked: back where it came from
        } else {
          b.touches = 0;
          b.lastTeam = px < 0 ? 0 : 1;
        }
      }
      if (b.fast) this.fx.burst({ x: b.x, y: b.y, z: b.z }, { count: 1, colors: ["#ffffff"], speed: 0.2, gravity: 0, size: 0.2, sizeEnd: 0, life: 0.25, shape: "ball" });
      if (b.y <= BR) {
        b.y = BR;
        this.fx.burst({ x: b.x, y: 0.1, z: b.z }, { count: 26, colors: SAND, speed: 3.5, up: 4, gravity: 14, size: 0.13, life: 0.7, shape: "ball" });
        this.fx.ring({ x: b.x, y: 0.02, z: b.z }, "#fff1cc", 1.4, 0.45);
        this.sound("land");
        this.shake = 0.2;
        this.point(b.x < 0 ? 1 : 0);
      }
    } else if (this.phase === "point") {
      // the ball rolls a little in the sand
      b.vx *= Math.exp(-3 * dt);
      b.vz *= Math.exp(-3 * dt);
      b.x += b.vx * dt * 0.3;
      b.z += b.vz * dt * 0.3;
      if (this.score[0] >= TARGET || this.score[1] >= TARGET) {
        if (this.phaseT > 1.0) this.end();
      } else if (this.phaseT > 2.2) this.setupServe();
    }
    this.players.forEach((_, i) => this.placeAvatar(i, dt));
    this.animateWorld(dt);
    this.drawBall(dt);
    const lx = this.phase === "rally" ? clamp(b.x * 0.18, -1.4, 1.4) : 0;
    this.moveCam([lx, 9.4, 14.2], [lx, 1.1, -0.6], dt, 2);
    if (left <= 0) this.end();
  }

  private end() {
    if (this.ended) return;
    this.ended = true;
    this.hud.tip(null);
    this.marker.visible = false;
    const w = this.score[0] === this.score[1] ? null : this.score[0] > this.score[1] ? 0 : 1;
    this.finishByTeam(w);
  }

  // ------------------------------------------------------------ drawing

  private placeAvatar(i: number, dt: number) {
    const a = this.avatars[i];
    const me = this.pl[i];
    const b = this.b;
    a.pos.set(me.x, this.jumpY(me), me.z);
    a.groundY = 0;
    if (this.phase === "point" && this.phaseT < 1.3) return;
    const air = me.jt < JUMP_T;
    const sp = Math.hypot(me.vx, me.vz);
    if (me.dive > 0.2) a.anim = "swim";
    else if (me.dive > 0) a.anim = "fall";
    else if (me.act > 0) a.anim = me.actAnim;
    else if (air) a.anim = "jump";
    else if (sp > 0.6) {
      a.anim = "run";
      a.speed = clamp(sp / SPEED, 0, 1);
    } else a.anim = "idle";
    // face the ball while playing, the way you run otherwise
    if (this.phase === "rally" || this.phase === "serve") a.faceTo(b.x, b.z, dt, 10);
    else if (sp > 0.6) a.face(Math.atan2(me.vx, me.vz), dt);
  }

  private drawBall(dt: number) {
    const b = this.b;
    this.ballMesh.position.set(b.x, b.y, b.z);
    const sp = Math.hypot(b.vx, b.vz);
    if (sp > 0.1) {
      this.ballMesh.rotation.z -= (b.vx / BR) * dt * 0.5;
      this.ballMesh.rotation.x += (b.vz / BR) * dt * 0.5;
    }
    this.ballShadow.position.set(b.x, 0.03, b.z);
    const h = b.y;
    this.ballShadow.scale.setScalar(BR * 2.4 * clamp(1.3 - h * 0.06, 0.5, 1.3));
    (this.ballShadow.material as THREE.MeshBasicMaterial).opacity = clamp(0.55 - h * 0.04, 0.2, 0.55);
    // where it will land
    const tl = b.live ? this.tAt(BR) : null;
    if (tl !== null && tl > 0.05) {
      const p = this.at(tl);
      this.marker.visible = true;
      this.marker.position.set(p.x, 0.04, p.z);
      const pulse = 1 + Math.sin(this.t * 14) * 0.08;
      this.marker.scale.setScalar((0.55 + Math.min(1, tl) * 0.35) * pulse);
      this.markerMat.color.set(p.x < 0 ? TEAM_COL[0] : TEAM_COL[1]);
      this.markerMat.opacity = 0.9;
    } else this.marker.visible = false;
  }

  private animateWorld(dt: number) {
    this.sea.offset.x += dt * 0.01;
    this.sea.offset.y = Math.sin(this.t * 0.6) * 0.02;
    const foam = this.scene.getObjectByName("foam");
    if (foam) foam.position.z = -14.6 + Math.sin(this.t * 0.8) * 0.35;
    if (this.netWob > 0) {
      this.netWob = Math.max(0, this.netWob - dt * 2);
      this.net.position.x = Math.sin(this.t * 40) * 0.08 * this.netWob;
    }
  }

  protected outroStep(dt: number) {
    this.animateWorld(dt);
    this.drawBall(dt);
    this.moveCam([0, 7.5, 12.5], [0, 1.1, -0.6], dt, 1.5);
  }
}

const def: MiniDef = {
  id: "beach-volley",
  name: "Beach Volley",
  icon: "🏐",
  color: "#ffd27a",
  tagline: "First to 5 points on the sand.",
  rules: "Get under the ball (the ring shows where it lands) and press A: the first touch sets, the next sends it over. At the net, B to jump and spike! First to 5 points.",
  controls: { stick: "Move", a: "Bump / set", b: "Jump / spike" },
  modes: ["2v2"],
  length: 60,
  music: "mini3",
  create: (ctx) => new BeachVolley(ctx),
};
export default def;
