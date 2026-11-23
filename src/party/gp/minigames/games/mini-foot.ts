/**
 * MINI FOOTBALL (2 vs 2, 60 s; team 0 the Shielded in red, team 1 the Transparent in blue): a small walled pitch in a city park, a big bouncy ball, no out of
 * bounds. Run into the ball to dribble it. A = a strong shot (where the stick points, toward the
 * goal otherwise). B = a pass to your teammate when you have the ball, a tackle-dash otherwise
 * (dashing into the ball carrier knocks them over). Kick-off after each goal; most goals wins.
 */
import * as THREE from "three";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef } from "../types";
import { GEO, ball, blobShadow, box, canvasTex, cloud, cone, cyl, group, toon, tree } from "../../engine/gfx";
import { angDiff, clamp, damp } from "../../engine/util";
import { music } from "../../engine/audio";
import { T } from "../../../../i18n/lang";

const TIME = 60;
const HX = 11; // pitch half-length (x)
const HZ = 6.4; // pitch half-width (z)
const GOAL_W = 2.4; // goal mouth half-width
const GOAL_H = 2.0;
const GOAL_D = 1.3;
const R = 0.45; // ball radius
const PR = 0.45; // player radius
const SPEED = 6.3;
const SHOT_V = 17.5;
const DASH_V = 13;
const DASH_T = 0.22;
const DASH_CD = 1.0;
const STUN = 0.85;
const GRAV = 18;
const REACH = PR + R + 0.5;
const TEAM_COL = ["#ff5a4e", "#3d8bff"];
/** The teams' names, as Z-BALL CUP calls them. */
const teamName = (t: number) => (t === 0 ? T("Shielded", "屏蔽队") : T("Transparent", "透明队"));

interface Pl {
  x: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  dashT: number;
  dashCd: number;
  stun: number;
  kickT: number;
  bufA: number;
  bufB: number;
  goals: number;
  // CPU
  aimZ: number;
  plan: number;
}

class MiniFoot extends BaseMini {
  private pl: Pl[] = [];
  private bx = 0;
  private by = R;
  private bz = 0;
  private bvx = 0;
  private bvy = 0;
  private bvz = 0;
  /** Nobody can control the ball before this (it was just kicked). */
  private noCtl = 0;
  private owner = -1;
  private lastTouch = -1;
  private score = [0, 0];
  private state: "play" | "goal" | "kickoff" = "kickoff";
  private stateT = 0;
  private ballMesh!: THREE.Mesh;
  private ballShadow!: THREE.Mesh;
  private nets: THREE.Object3D[] = [];
  private netWob = [0, 0];
  private crowd: { g: THREE.Object3D; ph: number }[] = [];
  private excite = 0;
  private scoreEl!: HTMLElement;
  private hurried = false;
  private ended = false;

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#58b4ff", "#e2f4ff"], size: 16, sun: [0.35, 1, 0.55], fog: { near: 50, far: 120 } });
    this.buildPark();
    this.players.forEach((p, i) => {
      const a = this.spawn(i, 0, 0, 0, { scale: 1.15 });
      a.setRing(p.char.color);
      this.pl.push({ x: 0, z: 0, vx: 0, vz: 0, yaw: 0, dashT: 0, dashCd: 0, stun: 0, kickT: 0, bufA: 0, bufB: 0, goals: 0, aimZ: 0, plan: 0 });
    });
    const cards = this.hud.players(this.players, () => "⚽ 0", { teams: true });
    [...cards.children].forEach((c, i) => {
      c.classList.remove("tl", "tr", "bl", "br");
      c.classList.add(["tl", "bl", "tr", "br"][i]);
    });
    const u = (n: number) => `calc(var(--u)*${n})`;
    this.scoreEl = this.hud.add(
      `<div style="position:absolute;left:50%;top:${u(7.8)};transform:translateX(-50%);display:flex;align-items:center;gap:${u(0.8)};font-family:var(--title);font-size:${u(3.6)};color:#fff;-webkit-text-stroke:${u(0.3)} #1d1630;paint-order:stroke fill">
        ${[0, 1]
          .map(
            (t) =>
              `<div style="position:relative;display:flex;flex-direction:column;align-items:center"><span class="s${t}" style="display:inline-block;min-width:${u(5)};text-align:center;padding:0 ${u(1)};border-radius:${u(1.2)};background:${TEAM_COL[t]};border:${u(0.3)} solid #1d1630">0</span><span style="position:absolute;top:100%;margin-top:${u(0.4)};font-family:var(--font);font-weight:800;font-size:${u(1.25)};letter-spacing:.06em;-webkit-text-stroke:0;text-shadow:var(--tsh);white-space:nowrap">${teamName(t).toUpperCase()}</span></div>`,
          )
          .join(`<span style="font-size:${u(2.6)}">–</span>`)}
      </div>`,
    );
    this.hud.timer(TIME);
    this.kickoff(true);
    this.setCam([0, 26, 26], [0, 0, 0.8], 42);
  }

  /** Team 0 attacks toward +x, team 1 toward -x. */
  private dir(team: number) {
    return team === 0 ? 1 : -1;
  }
  private mateOf(i: number) {
    return this.players.findIndex((p, j) => j !== i && p.team === this.players[i].team);
  }

  // ------------------------------------------------------------ the park

  private buildPark() {
    const s = this.scene;
    // the pitch: striped grass with painted lines
    const W = 1024,
      H = Math.round((1024 * HZ) / HX);
    const pitchTex = canvasTex(W, H, (g) => {
      for (let i = 0; i < 12; i++) {
        g.fillStyle = i % 2 ? "#4fb848" : "#5cc455";
        g.fillRect((i * W) / 12, 0, W / 12 + 1, H);
      }
      const sx = W / (HX * 2),
        sz = H / (HZ * 2);
      g.strokeStyle = "rgba(255,255,255,0.92)";
      g.lineWidth = 6;
      g.strokeRect(10, 10, W - 20, H - 20);
      g.beginPath();
      g.moveTo(W / 2, 10);
      g.lineTo(W / 2, H - 10);
      g.stroke();
      g.beginPath();
      g.arc(W / 2, H / 2, 2.2 * sx, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = "#fff";
      g.beginPath();
      g.arc(W / 2, H / 2, 8, 0, Math.PI * 2);
      g.fill();
      for (const side of [0, 1]) {
        const x0 = side ? W - 10 - 3.4 * sx : 10;
        g.strokeRect(x0, H / 2 - 3.6 * sz, 3.4 * sx, 7.2 * sz);
        g.beginPath();
        g.arc(side ? W - 10 - 3.4 * sx : 10 + 3.4 * sx, H / 2, 1.4 * sx, side ? Math.PI / 2 : -Math.PI / 2, side ? -Math.PI / 2 : Math.PI / 2, side === 1);
        g.stroke();
      }
    });
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshToonMaterial({ map: pitchTex }));
    pitch.rotation.x = -Math.PI / 2;
    pitch.position.y = 0.01;
    pitch.receiveShadow = true;
    s.add(pitch);
    const lawn = new THREE.Mesh(new THREE.CircleGeometry(90, 40), toon("#86cc62"));
    lawn.rotation.x = -Math.PI / 2;
    lawn.receiveShadow = true;
    s.add(lawn);
    // a path around
    const path = new THREE.Mesh(new THREE.RingGeometry(16.5, 18.2, 64), toon("#e6d2a8"));
    path.rotation.x = -Math.PI / 2;
    path.scale.set(1.25, 0.95, 1);
    path.position.y = 0.005;
    path.receiveShadow = true;
    s.add(path);
    // the boards around the pitch
    const boardTex = canvasTex(512, 64, (g, w, h) => {
      g.fillStyle = "#2464c8";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#ffffff";
      g.fillRect(0, h * 0.42, w, h * 0.16);
      g.fillStyle = "#ffd23f";
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        const cx = (i + 0.5) * (w / 4);
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
          const rr = k % 2 ? 7 : 16;
          g.lineTo(cx + Math.cos(a) * rr, h / 2 + Math.sin(a) * rr);
        }
        g.fill();
      }
    }, true);
    const boardMat = new THREE.MeshToonMaterial({ map: boardTex });
    const BH = 0.75;
    const side = toon("#1d4fa0");
    const board = (x: number, z: number, len: number, alongX: boolean) => {
      const mats = alongX ? [side, side, toon("#ffffff"), side, boardMat, boardMat] : [boardMat, boardMat, toon("#ffffff"), side, side, side];
      const m = new THREE.Mesh(GEO.box, mats);
      m.scale.set(alongX ? len : 0.2, BH, alongX ? 0.2 : len);
      m.position.set(x, BH / 2, z);
      m.castShadow = m.receiveShadow = true;
      s.add(m);
    };
    board(0, -HZ - 0.1, HX * 2 + 0.4, true);
    board(0, HZ + 0.1, HX * 2 + 0.4, true);
    for (const sx of [-1, 1]) {
      const segLen = HZ - GOAL_W;
      board(sx * (HX + 0.1), -(GOAL_W + segLen / 2), segLen, false);
      board(sx * (HX + 0.1), GOAL_W + segLen / 2, segLen, false);
    }
    // the goals
    const netTex = canvasTex(128, 128, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.strokeStyle = "#ffffff";
      g.lineWidth = 3;
      for (let k = 0; k <= w; k += 16) {
        g.beginPath();
        g.moveTo(k, 0);
        g.lineTo(k, h);
        g.stroke();
        g.beginPath();
        g.moveTo(0, k);
        g.lineTo(w, k);
        g.stroke();
      }
    }, true);
    const netMat = new THREE.MeshToonMaterial({ map: netTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });
    for (const sx of [-1, 1]) {
      const gg = group(s, { x: sx * HX });
      const post = toon("#ffffff");
      for (const sz of [-1, 1]) cyl(gg, post, 0.09, GOAL_H, { z: sz * GOAL_W, y: GOAL_H / 2, seg: 10 });
      cyl(gg, post, 0.09, GOAL_W * 2 + 0.18, { y: GOAL_H, rx: Math.PI / 2, seg: 10 });
      const net = group(gg);
      const back = new THREE.Mesh(GEO.plane, netMat);
      back.scale.set(GOAL_W * 2, GOAL_H, 1);
      back.rotation.y = Math.PI / 2;
      back.position.set(sx * GOAL_D, GOAL_H / 2, 0);
      net.add(back);
      const top = new THREE.Mesh(GEO.plane, netMat);
      top.scale.set(GOAL_D, GOAL_W * 2, 1);
      top.rotation.x = Math.PI / 2;
      top.position.set((sx * GOAL_D) / 2, GOAL_H, 0);
      net.add(top);
      for (const sz of [-1, 1]) {
        const side = new THREE.Mesh(GEO.plane, netMat);
        side.scale.set(GOAL_D, GOAL_H, 1);
        side.position.set((sx * GOAL_D) / 2, GOAL_H / 2, sz * GOAL_W);
        net.add(side);
      }
      this.nets.push(net);
      // team flag behind each goal (the team that defends it)
      const team = sx < 0 ? 0 : 1;
      cyl(gg, "#d8d8e0", 0.05, 3.2, { x: sx * (GOAL_D + 0.8), z: -GOAL_W - 1.2, y: 1.6, seg: 6 });
      const fl = new THREE.Mesh(GEO.plane, new THREE.MeshToonMaterial({ color: TEAM_COL[team], side: THREE.DoubleSide }));
      fl.scale.set(1.1, 0.7, 1);
      fl.position.set(sx * (GOAL_D + 0.8) + 0.55, 2.8, -GOAL_W - 1.2);
      gg.add(fl);
    }
    // bleachers with a little crowd behind the far boards
    const shirts = ["#ff7a59", "#5ab0ff", "#ffd23f", "#7bd389", "#c78bff", "#ff9ad5", "#f4f4f4", "#5ad1c9"];
    const skins = ["#ffd2b0", "#e8b48a", "#c98d62", "#8a5a3a"];
    for (let row = 0; row < 2; row++) {
      box(s, row ? "#b8bcc8" : "#cfd3dc", 16, 0.5, 1.2, { y: 0.25 + row * 0.5, z: -HZ - 1.6 - row * 1.2 });
      for (let k = 0; k < 11; k++) {
        const x = -7.2 + k * 1.45 + row * 0.6;
        const g = group(s, { x, y: 0.5 + row * 0.5, z: -HZ - 1.6 - row * 1.2 });
        const body = new THREE.Mesh(GEO.capsule, toon(shirts[(k + row * 3) % shirts.length]));
        body.scale.set(0.55, 0.55, 0.45);
        body.position.y = 0.55;
        body.castShadow = true;
        g.add(body);
        ball(g, skins[(k + row) % skins.length], 0.24, { y: 1.1, lo: true });
        this.crowd.push({ g, ph: Math.random() * 6 });
      }
    }
    // the park: trees, benches, lamp posts, a bandstand, the city behind
    const trees: [number, number, number][] = [
      [-17, -10, 1.8],
      [-12, -12.5, 2],
      [12, -12.5, 2.1],
      [17, -10, 1.9],
      [-19.5, -3, 1.7],
      [19.5, -3, 1.8],
      [-20, 5, 1.6],
      [20, 5, 1.7],
      [-6, -14, 1.6],
      [6.5, -14.5, 1.7],
    ];
    trees.forEach(([x, z, sc], k) => tree(s, x, z, sc, k % 2 ? "#4fbf4a" : "#3fae4a"));
    for (const [x, z, ry] of [
      [-14.5, -8.5, 0.5],
      [14.5, -8.5, -0.5],
    ]) {
      const g = group(s, { x, z, ry });
      box(g, "#b8743a", 2, 0.1, 0.6, { y: 0.5 });
      box(g, "#b8743a", 2, 0.5, 0.1, { y: 0.85, z: -0.28 });
      for (const sx of [-0.8, 0.8]) box(g, "#3a3a4a", 0.08, 0.5, 0.5, { x: sx, y: 0.25 });
    }
    for (const [x, z] of [
      [-HX - 3, -HZ - 2],
      [HX + 3, -HZ - 2],
      [-HX - 3, HZ + 2],
      [HX + 3, HZ + 2],
    ]) {
      cyl(s, "#2d3a4a", 0.08, 4, { x, z, y: 2, seg: 8 });
      ball(s, toon("#fff3b0", "#ffcc33", 0.9), 0.28, { x, z, y: 4.1 });
    }
    // bandstand
    const bs = group(s, { x: -22, z: -13 });
    cyl(bs, "#f4efe2", 3, 0.6, { y: 0.3, seg: 16 });
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      cyl(bs, "#ffffff", 0.1, 3, { x: Math.cos(a) * 2.6, z: Math.sin(a) * 2.6, y: 2.1, seg: 6 });
    }
    cone(bs, "#2f9e5b", 3.4, 1.8, { y: 4.5 });
    // city blocks in the distance
    const winTex = canvasTex(128, 256, (g, w, h) => {
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#5a6f96";
      for (let y = 14; y < h - 10; y += 34) for (let x = 12; x < w - 10; x += 30) g.fillRect(x, y, 16, 22);
    });
    const blockCols = ["#f2c6a0", "#e8e0d0", "#f6d98a", "#d8b8c8", "#c8d8e8"];
    for (let k = 0; k < 14; k++) {
      const x = -42 + k * 6.5;
      const h = 8 + ((k * 37) % 9);
      const z = -26 - (k % 3) * 3;
      const m = new THREE.Mesh(GEO.box, [toon(blockCols[k % 5]), toon(blockCols[k % 5]), toon("#8a8f9e"), toon(blockCols[k % 5]), new THREE.MeshToonMaterial({ map: winTex, color: blockCols[k % 5] }), toon(blockCols[k % 5])]);
      m.scale.set(6, h, 5);
      m.position.set(x, h / 2, z);
      s.add(m);
    }
    cloud(s, -16, 15, -40, 2.4);
    cloud(s, 12, 17, -45, 2.8);
    // the ball
    const ballTex = canvasTex(256, 128, (g, w, h) => {
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#ff8a2e";
      for (let k = 0; k < 7; k++) {
        const cx = (k / 7) * w + 18,
          cy = k % 2 ? h * 0.3 : h * 0.7;
        g.beginPath();
        for (let q = 0; q < 5; q++) {
          const a = (q / 5) * Math.PI * 2;
          g.lineTo(cx + Math.cos(a) * 16, cy + Math.sin(a) * 16);
        }
        g.fill();
      }
      g.fillStyle = "#2a2a3a";
      g.fillRect(0, 0, w, 8);
      g.fillRect(0, h - 8, w, 8);
    });
    this.ballMesh = new THREE.Mesh(GEO.sphere, new THREE.MeshToonMaterial({ map: ballTex }));
    this.ballMesh.scale.setScalar(R);
    this.ballMesh.castShadow = true;
    s.add(this.ballMesh);
    this.ballShadow = blobShadow(R * 1.1, 0.45);
    s.add(this.ballShadow);
  }

  // ------------------------------------------------------------ kick-off and goals

  private kickoff(first = false) {
    this.players.forEach((p, i) => {
      const me = this.pl[i];
      const d = this.dir(p.team);
      const front = i % 2 === 0;
      me.x = -d * (front ? 2.6 : 6.5);
      me.z = front ? (p.team === 0 ? 1.4 : -1.4) : 0;
      me.vx = me.vz = 0;
      me.yaw = d > 0 ? Math.PI / 2 : -Math.PI / 2;
      me.stun = me.dashT = 0;
      me.dashCd = 0.3;
      this.avatars[i].yaw = me.yaw;
    });
    this.bx = 0;
    this.bz = 0;
    this.by = first ? R : 3;
    this.bvx = this.bvz = 0;
    this.bvy = 0;
    this.owner = -1;
    this.noCtl = 0;
    this.state = "kickoff";
    this.stateT = 0;
  }

  private goal(scorerTeam: number) {
    this.score[scorerTeam]++;
    this.state = "goal";
    this.stateT = 0;
    this.owner = -1;
    const own = this.lastTouch >= 0 && this.players[this.lastTouch].team !== scorerTeam;
    const who = this.lastTouch >= 0 ? this.players[this.lastTouch] : null;
    if (who && !own) {
      this.pl[who.i].goals++;
      this.hud.setScore(who.seat, `⚽ ${this.pl[who.i].goals}`);
    }
    (this.scoreEl.querySelector(`.s${scorerTeam}`) as HTMLElement).textContent = String(this.score[scorerTeam]);
    const team = teamName(scorerTeam);
    this.hud.banner(T("GOAL!", "进球！"), { color: TEAM_COL[scorerTeam], size: 12, ms: 1600, sub: who ? (own ? T(`Own goal by ${who.name}…`, `${who.name} 乌龙球……`) : T(`${who.name} scores for ${team}!`, `${who.name} 为${team}进球！`)) : undefined });
    const gx = this.dir(scorerTeam) * (HX + 0.6);
    this.fx.confetti({ x: gx, y: 2.2, z: 0 }, 80);
    this.fx.burst({ x: gx, y: 1, z: 0 }, { count: 24, colors: [TEAM_COL[scorerTeam], "#ffffff", "#ffd23f"], speed: 8, up: 4, size: 0.2, life: 1 });
    this.netWob[scorerTeam === 0 ? 1 : 0] = 1;
    this.shake = 0.6;
    this.excite = 1;
    this.sound("explode");
    this.sound("cheer");
    this.sound("fanfare");
    this.players.forEach((p, i) => {
      this.avatars[i].anim = p.team === scorerTeam ? "win" : "lose";
      if (p.team === scorerTeam) this.buzz(i, [60, 40, 120]);
    });
  }

  // ------------------------------------------------------------ CPUs

  protected cpu(i: number, dt: number): CpuPad {
    if (this.state !== "play") return {};
    const me = this.pl[i];
    const p = this.players[i];
    const lv = p.level;
    const d = this.dir(p.team);
    const mi = this.mateOf(i);
    const mate = this.pl[mi];
    const goalX = d * HX;
    const ownX = -d * HX;
    const opps = this.players.filter((q) => q.team !== p.team).map((q) => this.pl[q.i]);
    const react = this.cpuAfter(i, "react", 0.35 - 0.28 * lv);
    // the ball carrier
    if (this.owner === i) {
      const dg = Math.abs(goalX - me.x);
      const near = Math.min(...opps.map((o) => Math.hypot(o.x - me.x, o.z - me.z)));
      me.plan -= dt;
      // shoot from close enough, or when pressed near the goal
      if (react && me.plan <= 0 && ((dg < 9 && Math.abs(me.z) < 4.8) || (near < 1.8 && dg < 13))) {
        me.plan = 0.35;
        if (this.cpuChance(i, 0.45, 0.9)) {
          // aim at the corner the defenders cover least
          const def = opps.reduce((a, o) => (Math.abs(o.x - goalX) < Math.abs(a.x - goalX) ? o : a));
          const corner = def.z > 0 ? -1 : 1;
          me.aimZ = corner * (GOAL_W - 0.5) + (Math.random() - 0.5) * (1 - lv) * 3;
          const ax = goalX - me.x,
            az = me.aimZ - me.z;
          const l = Math.hypot(ax, az);
          return { x: ax / l, y: az / l, a: true };
        }
      }
      // pass when the mate is clearly better placed and nobody blocks
      if (react && me.plan <= 0 && near < 2.4) {
        const mateAhead = (mate.x - me.x) * d > 1.5;
        const mateFree = Math.min(...opps.map((o) => Math.hypot(o.x - mate.x, o.z - mate.z))) > 2.2;
        me.plan = 0.4;
        if (mateAhead && mateFree && this.cpuChance(i, 0.2, 0.6)) return { b: true };
      }
      // dribble toward the goal, steering around the nearest defender
      let tx = goalX - d * 0.5,
        tz = clamp(me.z * 0.6, -GOAL_W, GOAL_W);
      for (const o of opps) {
        const ox = o.x - me.x,
          oz = o.z - me.z;
        const od = Math.hypot(ox, oz);
        if (od < 3 && ox * d > -0.5) tz += (oz > 0 ? -1 : 1) * (3 - od) * 1.4;
      }
      tz = clamp(tz, -HZ + 1, HZ - 1);
      return this.toward(me, tx, tz, 1);
    }
    // where the ball will be in a moment
    const look = 0.25 + 0.15 * (1 - lv);
    const fx = clamp(this.bx + this.bvx * look, -HX + 0.5, HX - 0.5);
    const fz = clamp(this.bz + this.bvz * look, -HZ + 0.5, HZ - 0.5);
    const myD = Math.hypot(fx - me.x, fz - me.z);
    const mateD = Math.hypot(fx - mate.x, fz - mate.z);
    const chaser = this.owner === mi ? false : myD < mateD - 0.3 || (Math.abs(myD - mateD) <= 0.3 && i < mi);
    if (!react) return {};
    if (this.owner === mi) {
      // support: an open spot ahead of the carrier
      const tx = clamp(mate.x + d * 4.5, -HX + 1.5, HX - 1.5);
      const tz = clamp(mate.z > 0 ? mate.z - 4 : mate.z + 4, -HZ + 1, HZ - 1);
      return this.toward(me, tx, tz, 0.9);
    }
    if (chaser) {
      // get to the ball from the side facing the goal (behind it), tackle a close carrier
      const carrier = this.owner >= 0 && this.players[this.owner].team !== p.team ? this.pl[this.owner] : null;
      if (carrier && me.dashCd <= 0 && Math.hypot(carrier.x - me.x, carrier.z - me.z) < 2.0 && Math.random() < (0.5 + 2.5 * lv) * dt) {
        const ax = carrier.x - me.x,
          az = carrier.z - me.z;
        const l = Math.hypot(ax, az) || 1;
        return { x: ax / l, y: az / l, b: true };
      }
      const bx = fx - d * 0.55,
        bz = fz;
      const mv = this.toward(me, bx, bz, 1);
      // a loose ball right in front of the opponent's goal: just shoot it
      if (this.owner < 0 && myD < REACH && Math.abs(goalX - this.bx) < 6 && this.cpuChance(i, 0.02, 0.12)) {
        const ax = goalX - me.x,
          az = -me.z * 0.5;
        const l = Math.hypot(ax, az);
        return { x: ax / l, y: az / l, a: true };
      }
      return mv;
    }
    // defend: between the ball and our goal (beginners get drawn toward the ball)
    const k = 0.62 - 0.25 * (1 - lv);
    const tx = ownX * k + this.bx * (1 - k);
    const tz = clamp(this.bz * 0.55, -GOAL_W - 0.5, GOAL_W + 0.5);
    return this.toward(me, tx, tz, 0.85);
  }

  private toward(me: Pl, tx: number, tz: number, sp: number): CpuPad {
    const dx = tx - me.x,
      dz = tz - me.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.15) return {};
    const k = (Math.min(1, d * 1.6) * sp) / d;
    return { x: dx * k, y: dz * k };
  }

  // ------------------------------------------------------------ the game

  protected idle(dt: number) {
    this.moveCam([0, 17.5, 15.2], [0, 0, 0.9], dt, 1.5);
    this.animate(dt);
    this.drawAvatars(dt);
  }

  protected step(dt: number) {
    const left = TIME - this.t;
    this.hud.timer(left);
    this.stateT += dt;
    if (!this.hurried && left <= 10) {
      this.hurried = true;
      this.hud.banner(T("10 SECONDS LEFT!", "还剩 10 秒！"), { color: "#ffd23f", size: 6 });
      music.speed(1.15);
      this.sound("bell");
    }
    if (this.state === "kickoff") {
      if (this.stateT > 0.6) {
        this.state = "play";
        this.stateT = 0;
        this.sound("whistle");
      }
    }
    if (this.state === "goal" && this.stateT > 2.6) {
      this.kickoff();
      this.hud.banner(T("PLAY ON!", "继续！"), { size: 5, ms: 700 });
    }
    const playing = this.state === "play";
    // players
    this.players.forEach((p, i) => {
      const me = this.pl[i];
      const pad = this.pad(i);
      me.dashCd -= dt;
      me.kickT -= dt;
      me.bufA = pad.aDown ? 0.15 : Math.max(0, me.bufA - dt);
      me.bufB = pad.bDown ? 0.15 : Math.max(0, me.bufB - dt);
      if (!playing) {
        me.vx = damp(me.vx, 0, 8, dt);
        me.vz = damp(me.vz, 0, 8, dt);
        return;
      }
      if (me.stun > 0) {
        me.stun -= dt;
        me.vx *= Math.exp(-5 * dt);
        me.vz *= Math.exp(-5 * dt);
      } else if (me.dashT > 0) {
        me.dashT -= dt;
      } else {
        const k = 1 - Math.exp(-11 * dt);
        const sp = SPEED * (this.owner === i ? 0.9 : 1);
        me.vx += (pad.x * sp - me.vx) * k;
        me.vz += (pad.y * sp - me.vz) * k;
        const l = Math.hypot(pad.x, pad.y);
        if (l > 0.25) me.yaw = Math.atan2(pad.x, pad.y);
        // A: shoot
        const dB = Math.hypot(this.bx - me.x, this.bz - me.z);
        if (me.bufA > 0 && dB < REACH && this.by < 1.6) {
          me.bufA = 0;
          this.shoot(i);
        } else if (me.bufB > 0) {
          me.bufB = 0;
          // a pass with the ball at your feet; against a carrier, a tackle
          const theirs = this.owner >= 0 && this.players[this.owner].team !== p.team;
          if (dB < REACH && this.by < 1.6 && !theirs) this.pass(i);
          else if (me.dashCd <= 0) {
            const yaw = l > 0.25 ? Math.atan2(pad.x, pad.y) : me.yaw;
            me.yaw = yaw;
            me.vx = Math.sin(yaw) * DASH_V;
            me.vz = Math.cos(yaw) * DASH_V;
            me.dashT = DASH_T;
            me.dashCd = DASH_CD;
            this.sound("whoosh");
            this.fx.dust({ x: me.x, y: 0, z: me.z }, 6, "#cdeec0");
          }
        }
      }
      me.x += me.vx * dt;
      me.z += me.vz * dt;
      me.x = clamp(me.x, -HX + PR, HX - PR);
      me.z = clamp(me.z, -HZ + PR, HZ - PR);
    });
    if (playing) this.collide();
    this.stepBall(dt, playing);
    this.animate(dt);
    this.drawAvatars(dt);
    const cx = clamp(this.bx * 0.12, -1.2, 1.2);
    this.moveCam([cx, 17.5, 15.2], [cx, 0, 0.9], dt, 2);
    if (left <= 0 && !this.ended) {
      this.ended = true;
      this.finishByTeam(this.score[0] === this.score[1] ? null : this.score[0] > this.score[1] ? 0 : 1);
    }
  }

  private shoot(i: number) {
    const me = this.pl[i];
    const p = this.players[i];
    const pad = this.pad(i);
    const d = this.dir(p.team);
    // aim help: a shot already going toward the goal bends toward the mouth
    const gz = clamp(me.z, -GOAL_W + 0.6, GOAL_W - 0.6);
    const gy = Math.atan2(d * HX - me.x, gz - me.z);
    let yaw = Math.hypot(pad.x, pad.y) > 0.3 ? Math.atan2(pad.x, pad.y) : gy;
    if (Math.abs(angDiff(yaw, gy)) < 0.5) yaw += angDiff(yaw, gy) * 0.5;
    this.bvx = Math.sin(yaw) * SHOT_V;
    this.bvz = Math.cos(yaw) * SHOT_V;
    this.bvy = 3.2;
    this.noCtl = 0.3;
    this.owner = -1;
    this.lastTouch = i;
    me.yaw = yaw;
    me.kickT = 0.3;
    this.sound("hit");
    this.shake = 0.15;
    this.buzz(i, 50);
    this.fx.burst({ x: this.bx, y: 0.4, z: this.bz }, { count: 12, colors: ["#ffffff", "#ffe14a"], speed: 5, size: 0.14, life: 0.4, shape: "ball" });
  }

  private pass(i: number) {
    const me = this.pl[i];
    const mate = this.pl[this.mateOf(i)];
    const tx = mate.x + mate.vx * 0.45,
      tz = mate.z + mate.vz * 0.45;
    const dx = tx - this.bx,
      dz = tz - this.bz;
    const l = Math.hypot(dx, dz) || 1;
    const v = clamp(l / 0.5, 8, 15);
    this.bvx = (dx / l) * v;
    this.bvz = (dz / l) * v;
    this.bvy = 1.5;
    this.noCtl = 0.18;
    this.owner = -1;
    this.lastTouch = i;
    me.yaw = Math.atan2(dx, dz);
    me.kickT = 0.25;
    this.sound("pop");
    this.buzz(i, 25);
  }

  private collide() {
    // players push each other; a dash knocks the other one over
    for (let i = 0; i < 4; i++)
      for (let j = i + 1; j < 4; j++) {
        const A = this.pl[i],
          B = this.pl[j];
        const dx = B.x - A.x,
          dz = B.z - A.z;
        const d = Math.hypot(dx, dz);
        if (d < PR * 2 + 0.1 && d > 1e-4) {
          const push = (PR * 2 + 0.1 - d) / 2;
          A.x -= (dx / d) * push;
          A.z -= (dz / d) * push;
          B.x += (dx / d) * push;
          B.z += (dz / d) * push;
          for (const [ai, vi] of [
            [i, j],
            [j, i],
          ]) {
            const att = this.pl[ai],
              vic = this.pl[vi];
            if (att.dashT > 0 && vic.stun <= 0 && this.players[ai].team !== this.players[vi].team) {
              vic.stun = STUN;
              const k = ai === i ? 1 : -1;
              vic.vx = (dx / d) * 7 * k;
              vic.vz = (dz / d) * 7 * k;
              att.dashT = 0;
              att.vx *= 0.3;
              att.vz *= 0.3;
              this.avatars[vi].flash();
              this.sound("bonk");
              this.buzz(vi, [60, 40, 60]);
              this.fx.burst({ x: vic.x, y: 1, z: vic.z }, { count: 10, colors: ["#ffffff", "#ffe14a"], speed: 4, size: 0.15 });
              if (this.owner === vi) {
                this.owner = -1;
                this.noCtl = 0.15;
                this.bvx = att.vx * 0.5 + (dx / d) * 4 * k;
                this.bvz = att.vz * 0.5 + (dz / d) * 4 * k;
                this.bvy = 3;
                this.hud.pop(new THREE.Vector3(vic.x, 2.4, vic.z), T("Tackled!", "铲倒！"), "#ffe14a", this.camera);
              }
            }
          }
        }
      }
  }

  private stepBall(dt: number, playing: boolean) {
    this.noCtl -= dt;
    // who controls it: the closest player in reach (dribble)
    if (playing) {
      let best = -1,
        bd = 1e9;
      this.pl.forEach((me, i) => {
        if (me.stun > 0) return;
        const d = Math.hypot(this.bx - me.x, this.bz - me.z);
        if (d < PR + R + 0.3 && this.by < 1.0 && d < bd) {
          bd = d;
          best = i;
        }
      });
      if (this.noCtl > 0) best = -1;
      if (best >= 0 && best !== this.owner) {
        if (this.owner < 0) this.sound("step");
        this.owner = best;
        this.lastTouch = best;
      }
      if (best < 0 && this.owner >= 0) {
        const o = this.pl[this.owner];
        if (Math.hypot(this.bx - o.x, this.bz - o.z) > PR + R + 0.6) this.owner = -1;
      }
    }
    if (this.owner >= 0 && playing) {
      const me = this.pl[this.owner];
      // the ball rolls just in front of the carrier
      const sp = Math.hypot(me.vx, me.vz);
      const yaw = sp > 0.5 ? Math.atan2(me.vx, me.vz) : me.yaw;
      const tx = me.x + Math.sin(yaw) * (PR + R + 0.1),
        tz = me.z + Math.cos(yaw) * (PR + R + 0.1);
      const k = 1 - Math.exp(-14 * dt);
      this.bvx += ((tx - this.bx) / 0.12 + me.vx - this.bvx) * k;
      this.bvz += ((tz - this.bz) / 0.12 + me.vz - this.bvz) * k;
      // a dashing player entering the ball: hoofs it
      if (me.dashT > 0) {
        this.bvx = me.vx * 1.2;
        this.bvz = me.vz * 1.2;
        this.bvy = 2.5;
        this.owner = -1;
        this.noCtl = 0.2;
      }
    } else if (playing) {
      // touching a player: bounce off them (a dash sends it flying)
      for (let i = 0; i < 4; i++) {
        const me = this.pl[i];
        const dx = this.bx - me.x,
          dz = this.bz - me.z;
        const d = Math.hypot(dx, dz);
        if (d < PR + R && d > 1e-4 && this.by < 1.4) {
          const nx = dx / d,
            nz = dz / d;
          this.bx = me.x + nx * (PR + R);
          this.bz = me.z + nz * (PR + R);
          const rel = (this.bvx - me.vx) * nx + (this.bvz - me.vz) * nz;
          if (rel < 0) {
            this.bvx -= rel * nx * 1.6;
            this.bvz -= rel * nz * 1.6;
          }
          if (me.dashT > 0) {
            this.bvx = me.vx * 1.25;
            this.bvz = me.vz * 1.25;
            this.bvy = 3;
            this.sound("pop");
          }
          this.lastTouch = i;
        }
      }
    }
    // physics
    this.bvy -= GRAV * dt;
    this.bx += this.bvx * dt;
    this.by += this.bvy * dt;
    this.bz += this.bvz * dt;
    if (this.by < R) {
      this.by = R;
      if (this.bvy < -2.5) {
        this.bvy = -this.bvy * 0.6;
        if (this.bvy > 3) this.sound("boing");
      } else this.bvy = 0;
    }
    if (this.by <= R + 0.01) {
      const f = Math.exp(-(this.owner >= 0 ? 0 : 0.8) * dt);
      this.bvx *= f;
      this.bvz *= f;
    }
    // walls (the goal mouths are open)
    if (Math.abs(this.bz) > HZ - R) {
      this.bz = Math.sign(this.bz) * (HZ - R);
      if (Math.abs(this.bvz) > 4) this.sound("thud");
      this.bvz = -this.bvz * 0.78;
    }
    const inMouth = Math.abs(this.bz) < GOAL_W - R * 0.6 && this.by < GOAL_H - R * 0.5;
    if (Math.abs(this.bx) > HX - R) {
      if (inMouth && this.state === "play") {
        if (Math.abs(this.bx) > HX + R) this.goal(this.bx > 0 ? 0 : 1);
      } else if (this.state !== "goal" || Math.abs(this.bx) < HX) {
        if (Math.abs(this.bx) < HX + 0.2) {
          this.bx = Math.sign(this.bx) * (HX - R);
          if (Math.abs(this.bvx) > 4) this.sound("thud");
          this.bvx = -this.bvx * 0.78;
        }
      }
    }
    // inside the net
    if (Math.abs(this.bx) > HX + GOAL_D - R) {
      this.bx = Math.sign(this.bx) * (HX + GOAL_D - R);
      this.bvx = -this.bvx * 0.2;
    }
    if (Math.abs(this.bx) > HX) {
      this.bz = clamp(this.bz, -GOAL_W + R, GOAL_W - R);
      if (this.by > GOAL_H - R) {
        this.by = GOAL_H - R;
        this.bvy = Math.min(0, this.bvy);
      }
    }
    // drawing
    this.ballMesh.position.set(this.bx, this.by, this.bz);
    this.ballMesh.rotation.z -= (this.bvx / R) * dt;
    this.ballMesh.rotation.x += (this.bvz / R) * dt;
    this.ballShadow.position.set(this.bx, 0.03, this.bz);
    this.ballShadow.scale.setScalar(R * 2.3 * clamp(1.2 - this.by * 0.08, 0.5, 1.2));
    const fast = Math.hypot(this.bvx, this.bvz) > 12;
    if (fast) this.fx.burst({ x: this.bx, y: this.by, z: this.bz }, { count: 1, colors: ["#ffffff"], speed: 0.2, gravity: 0, size: 0.25, sizeEnd: 0, life: 0.22, shape: "ball" });
  }

  // ------------------------------------------------------------ drawing

  private drawAvatars(dt: number) {
    this.players.forEach((_, i) => {
      const a = this.avatars[i];
      const me = this.pl[i];
      a.pos.set(me.x, 0, me.z);
      if (this.state === "goal" && this.stateT < 2.4) {
        a.face(0, dt, 6);
        return;
      }
      const sp = Math.hypot(me.vx, me.vz);
      if (me.stun > 0) a.anim = "stun";
      else if (me.dashT > 0) a.anim = "jump";
      else if (me.kickT > 0) a.anim = "throw";
      else if (sp > 0.5) {
        a.anim = "run";
        a.speed = clamp(sp / SPEED, 0.2, 1);
      } else a.anim = "idle";
      if (me.stun <= 0) {
        if (sp > 0.5 && me.kickT <= 0) a.face(Math.atan2(me.vx, me.vz), dt);
        else if (me.kickT > 0) a.face(me.yaw, dt, 20);
        else a.faceTo(this.bx, this.bz, dt, 6);
      }
      this.hud.mark(this.players[i].seat, "hot", this.owner === i);
    });
  }

  private animate(dt: number) {
    this.excite = Math.max(0, this.excite - dt * 0.4);
    const near = Math.abs(this.bx) > HX - 5 ? 0.4 : 0;
    for (const c of this.crowd) {
      c.ph += dt * (4 + 8 * this.excite);
      c.g.children[0].position.y = 0.55 + Math.abs(Math.sin(c.ph)) * (0.03 + 0.25 * Math.max(this.excite, near));
      c.g.children[1].position.y = 1.1 + Math.abs(Math.sin(c.ph)) * (0.03 + 0.25 * Math.max(this.excite, near));
    }
    this.nets.forEach((n, k) => {
      if (this.netWob[k] > 0) {
        this.netWob[k] = Math.max(0, this.netWob[k] - dt * 1.2);
        n.scale.x = 1 + Math.sin(this.t * 30) * 0.12 * this.netWob[k];
      }
    });
  }

  protected outroStep(dt: number) {
    this.animate(dt);
    this.moveCam([0, 12, 12], [0, 0, 0.5], dt, 1.5);
  }
}

const def: MiniDef = {
  id: "mini-foot",
  name: "Mini Football",
  icon: "⚽",
  color: "#3fbf5a",
  tagline: "Score more goals than the other team.",
  rules: "Run into the ball to dribble. A to shoot where the stick points. B: pass to your teammate, or tackle without the ball. Most goals in 60 s.",
  controls: { stick: "Run", a: "Shoot", b: "Pass / tackle" },
  modes: ["2v2"],
  length: 60,
  music: "mini",
  create: (ctx) => new MiniFoot(ctx),
};
export default def;
