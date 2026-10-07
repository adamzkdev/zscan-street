import * as THREE from "three";
import { BX, BZ, GD, GH, GW, HX, HZ, PL, PW, canvasTex, rng } from "./layout";
import { Footballer, type Kit } from "./players";

/**
 * Seven-a-side on the BLOCK STADIUM pitch: Shielded (gold, attacking +x) against Transparent
 * (silver, attacking -x), a keeper each, a referee. A real ball (gravity, bounces, spin, posts,
 * crossbar, nets, the board cage). In "watch" mode the AI plays and only the blocks score: the side
 * that wins a block gets a goal they can't miss, every other shot is saved or goes wide. In "play"
 * mode the visitor is Shielded's striker: run into the ball to dribble, shoot where you look.
 */

const G = 9.81;
const BR = 0.22;
const R = rng(99);
const rnd = (a: number, b: number) => a + R() * (b - a);

export interface MatchEvents {
  goal(team: 0 | 1, byVisitor: boolean): void;
  /** A save, the post, a shot just wide: the crowd rises. */
  ooh(): void;
  /** The net shook (which goal, -1 / +1). */
  net(side: number, power: number): void;
}

interface Player {
  f: Footballer;
  team: 0 | 1;
  gk: boolean;
  /** Formation spot in the team's own frame: x from -1 (own line) to 1, z from -1 to 1. */
  fx: number;
  fz: number;
  pos: THREE.Vector2;
  vel: THREE.Vector2;
  cd: number;
  you: boolean;
  goals: number;
  role: string;
}

const SHAPE: [number, number, string][] = [
  [-0.95, 0, "Goalkeeper"],
  [-0.6, -0.48, "Defender"],
  [-0.6, 0.48, "Defender"],
  [-0.28, -0.62, "Midfielder"],
  [-0.32, 0, "Midfielder"],
  [-0.28, 0.62, "Midfielder"],
  [0.06, 0, "Striker"],
];

export class Match {
  readonly group = new THREE.Group();
  readonly players: Player[] = [];
  private ref: Footballer;
  private refPos = new THREE.Vector2(0, -6);
  readonly ball = new THREE.Vector3(0, BR, 0);
  readonly bv = new THREE.Vector3();
  private ballMesh: THREE.Mesh;
  private ballShadow: THREE.Mesh;
  private shadows: THREE.InstancedMesh;
  mode: "watch" | "play" = "watch";
  score: [number, number] = [0, 0];
  state: "play" | "goal" | "kickoff" | "out" = "kickoff";
  private stateT = 0;
  private lastTouch: Player | null = null;
  private scorer: 0 | 1 = 0;
  private kickoffTeam: 0 | 1 = 0;
  /** Watch mode: a block was won, this side scores next. */
  private scripted: { team: 0 | 1; t: number } | null = null;
  private you: Player;
  private youPos = new THREE.Vector2();
  private youPrev = new THREE.Vector2();
  private youVel = new THREE.Vector2();
  private youCd = 0;
  private outAt = new THREE.Vector2();
  /** Seconds of match played in the visitor's game. */
  clock = 0;
  private camPos = new THREE.Vector3();

  constructor(
    scene: THREE.Object3D,
    ids: number[],
    private ev: MatchEvents,
  ) {
    scene.add(this.group);
    const nums = [1, 4, 5, 8, 6, 10, 9];
    let k = 0;
    for (const team of [0, 1] as const)
      SHAPE.forEach(([fx, fz, role], i) => {
        const kit: Kit = team === 0 ? (i === 0 ? "goldGk" : "gold") : i === 0 ? "silverGk" : "silver";
        const f = new Footballer(kit, ids[k % ids.length], nums[i], k + team);
        k++;
        this.group.add(f.g);
        this.players.push({ f, team, gk: i === 0, fx, fz, pos: new THREE.Vector2(), vel: new THREE.Vector2(), cd: 0, you: false, goals: 0, role });
      });
    this.you = this.players[6];
    this.ref = new Footballer("ref", ids[(k + 3) % ids.length], 0, 2);
    this.group.add(this.ref.g);
    // the ball: white panels with the gold Zcash hexagons
    const tex = canvasTex(256, 128, (g) => {
      g.fillStyle = "#f6f6f2";
      g.fillRect(0, 0, 256, 128);
      const hex = (x: number, y: number, r: number, c: string) => {
        g.fillStyle = c;
        g.beginPath();
        for (let i = 0; i < 6; i++) g.lineTo(x + r * Math.cos((i * Math.PI) / 3), y + r * Math.sin((i * Math.PI) / 3));
        g.fill();
      };
      for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) hex(i * 44 + (j % 2) * 22 + 10, j * 44 + 20, 13, (i + j) % 3 === 0 ? "#f4b728" : "#16151b");
    });
    this.ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BR, 20, 14), new THREE.MeshStandardMaterial({ map: tex.t, roughness: 0.45 }));
    this.group.add(this.ballMesh);
    // floodlight shadows: four faint blobs per player, one from each mast, and the ball's
    const blob = canvasTex(64, 64, (g) => {
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, "rgba(0,0,0,0.55)");
      gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
    });
    const shMat = new THREE.MeshBasicMaterial({ map: blob.t, transparent: true, depthWrite: false, opacity: 0.6 });
    this.shadows = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), shMat, (this.players.length + 1) * 4);
    this.shadows.frustumCulled = false;
    this.group.add(this.shadows);
    this.ballShadow = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6).rotateX(-Math.PI / 2), shMat);
    this.group.add(this.ballShadow);
    this.kickoff(0);
  }

  /** The visitor steps on (play) or watches (the striker's spot goes back to the AI). */
  setMode(m: "watch" | "play") {
    if (m === this.mode) return;
    this.mode = m;
    this.you.you = m === "play";
    this.you.f.g.visible = m !== "play";
    this.scripted = null;
    if (m === "play") {
      this.score = [0, 0];
      this.clock = 0;
    }
    this.kickoff(0);
  }

  /** Watch mode: the side that won the block scores. */
  blockGoal(team: 0 | 1) {
    if (this.mode !== "watch") return;
    this.scripted = { team, t: 0 };
    if (this.state !== "play") this.state = "play";
  }

  private dir(team: 0 | 1) {
    return team === 0 ? 1 : -1;
  }

  kickoff(team: 0 | 1, cam?: THREE.Vector3) {
    this.kickoffTeam = team;
    this.state = "kickoff";
    this.stateT = 0;
    this.ball.set(0, BR, 0);
    this.bv.set(0, 0, 0);
    for (const p of this.players) {
      const d = this.dir(p.team);
      let x = Math.min(p.fx * PL * 0.8, -1.5);
      if (p.fx > 0 && p.team === team) x = -0.45;
      p.pos.set(x * d, p.fz * PW * 0.8);
      p.vel.set(0, 0);
      p.f.cheer = 0;
      p.f.dive = 0;
    }
    this.refPos.set(0, -8);
    if (cam && this.mode === "play") {
      cam.x = team === 0 ? -0.9 : -7;
      cam.z = team === 0 ? 0.25 : 0;
    }
  }

  /** Space / click on the pitch: a hard shot where the visitor looks. */
  shoot(camera: THREE.Camera) {
    if (this.mode !== "play" || this.state === "goal") return false;
    const p = camera.position;
    const d = Math.hypot(this.ball.x - p.x, this.ball.z - p.z);
    // Space also jumps (walk.ts): in the air the shot becomes a volley or a header
    const reachY = Math.max(1.4, p.y - 0.2);
    if (d > 2.1 || this.ball.y > reachY) return false;
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    const h = new THREE.Vector2(fwd.x, fwd.z).normalize();
    const lift = THREE.MathUtils.clamp(fwd.y + 0.2, 0.04, 0.62);
    const sp = 27;
    this.bv.set(h.x * sp * Math.cos(lift), sp * Math.sin(lift), h.y * sp * Math.cos(lift));
    this.ball.y = Math.max(this.ball.y, BR + 0.02);
    this.lastTouch = this.you;
    this.youCd = 0.45;
    if (this.state === "kickoff") this.state = "play";
    return true;
  }

  // ---- the ball --------------------------------------------------------------------------------

  private physics(dt: number) {
    const b = this.ball,
      v = this.bv;
    const px = b.x,
      pz = b.z;
    v.y -= G * dt;
    b.addScaledVector(v, dt);
    const drag = Math.exp(-0.06 * dt);
    v.multiplyScalar(drag);
    if (b.y < BR) {
      b.y = BR;
      if (v.y < -1.2) v.y = -v.y * 0.52;
      else v.y = 0;
      // rolling on grass
      const f = Math.exp(-0.75 * dt);
      v.x *= f;
      v.z *= f;
    }
    // the board cage
    if (b.y < 0.95 + BR) {
      if (Math.abs(b.x) > BX - BR) {
        b.x = Math.sign(b.x) * (BX - BR);
        v.x *= -0.55;
      }
      if (Math.abs(b.z) > BZ - BR) {
        b.z = Math.sign(b.z) * (BZ - BR);
        v.z *= -0.55;
      }
    }
    // goals: posts, crossbar, nets
    for (const s of [-1, 1]) {
      const gx = s * PL;
      for (const zp of [-GW, GW]) {
        const dx = b.x - (gx + s * 0.065),
          dz = b.z - zp;
        const dd = Math.hypot(dx, dz);
        if (b.y < GH + BR && dd < BR + 0.065) {
          const nx = dx / dd,
            nz = dz / dd;
          const vn = v.x * nx + v.z * nz;
          if (vn < 0) {
            v.x -= 1.7 * vn * nx;
            v.z -= 1.7 * vn * nz;
            if (Math.abs(vn) > 6) this.ev.ooh();
          }
          b.x = gx + s * 0.065 + nx * (BR + 0.066);
          b.z = zp + nz * (BR + 0.066);
        }
      }
      if (Math.abs(b.z) < GW) {
        const dx = b.x - (gx + s * 0.065),
          dy = b.y - GH;
        const dd = Math.hypot(dx, dy);
        if (dd < BR + 0.065) {
          const nx = dx / dd,
            ny = dy / dd;
          const vn = v.x * nx + v.y * ny;
          if (vn < 0) {
            v.x -= 1.7 * vn * nx;
            v.y -= 1.7 * vn * ny;
            if (Math.abs(vn) > 6) this.ev.ooh();
          }
          b.x = gx + s * 0.065 + nx * (BR + 0.066);
          b.y = GH + ny * (BR + 0.066);
        }
      }
      // inside the goal frame (behind the line): the net holds it
      const ax = Math.abs(b.x),
        apx = Math.abs(px);
      if (Math.sign(b.x) === s && ax > PL && ax < PL + GD + BR + 0.1 && b.y < GH + 0.2) {
        const wasIn = Math.abs(pz) < GW && apx > PL - 0.3;
        if (wasIn) {
          const back = PL + GD - BR - (b.y > GH - 0.5 ? ((b.y - (GH - 0.5)) / 0.5) * GD : 0) * 0.9;
          if (ax > back) {
            this.ev.net(s, Math.abs(v.x));
            b.x = s * back;
            v.x *= -0.12;
            v.z *= 0.5;
          }
          if (Math.abs(b.z) > GW - BR) {
            b.z = Math.sign(b.z) * (GW - BR);
            v.z *= -0.2;
            v.x *= 0.7;
          }
          if (b.y > GH - BR) {
            b.y = GH - BR;
            v.y = -Math.abs(v.y) * 0.2;
          }
        } else if (Math.abs(b.z) < GW + BR && Math.abs(pz) >= GW) {
          // the side netting from outside
          b.z = Math.sign(pz) * (GW + BR);
          v.z *= -0.25;
        } else if (apx > PL + GD) {
          b.x = s * (PL + GD + BR);
          v.x *= -0.25;
        }
      }
    }
  }

  // ---- the players -----------------------------------------------------------------------------

  private aim(from: THREE.Vector3, tx: number, ty: number, tz: number, sp: number) {
    const D = Math.hypot(tx - from.x, tz - from.z);
    const T = Math.max(0.15, D / sp);
    this.bv.set(((tx - from.x) / D) * sp, (ty - from.y + 0.5 * G * T * T) / T, ((tz - from.z) / D) * sp);
  }

  private shootAI(p: Player, sure: boolean) {
    const d = this.dir(p.team);
    const gx = d * (PL + 0.4);
    const side = R() < 0.5 ? -1 : 1;
    let tz = side * (GW - rnd(0.35, 0.7));
    const ty = rnd(0.3, 1.9);
    if (this.mode === "watch" && !sure && R() < 0.55) tz = side * (GW + rnd(0.5, 2.6));
    const dist = Math.hypot(gx - this.ball.x, tz - this.ball.z);
    this.aim(this.ball, gx, ty, tz, Math.min(30, 17 + dist * 0.35 + (sure ? 4 : 0)));
    p.cd = 0.6;
    p.f.kick = 1;
    this.lastTouch = p;
  }

  private pass(p: Player, to: THREE.Vector2, lead: THREE.Vector2) {
    const target = to.clone().addScaledVector(lead, 0.5);
    const D = target.distanceTo(new THREE.Vector2(this.ball.x, this.ball.z));
    const sp = THREE.MathUtils.clamp(D * 0.9 + 4, 7, 20);
    const dx = (target.x - this.ball.x) / D,
      dz = (target.y - this.ball.z) / D;
    this.bv.set(dx * sp, D > 18 ? 3.5 : 0.4, dz * sp);
    p.cd = 0.5;
    p.f.kick = 1;
    this.lastTouch = p;
  }

  private decide(p: Player, team: Player[], opp: Player[]) {
    const d = this.dir(p.team);
    const goal = new THREE.Vector2(d * PL, 0);
    const bp = new THREE.Vector2(this.ball.x, this.ball.z);
    const dg = bp.distanceTo(goal);
    const sc = this.scripted && this.scripted.team === p.team;
    if (sc) {
      if (dg < 34) return this.shootAI(p, true);
    } else if (dg < 9 || (dg < 17 && R() < 0.45)) return this.shootAI(p, false);
    // a pass forward to a free team-mate (the visitor gets plenty)
    if (!sc && R() < (this.mode === "play" ? 0.45 : 0.32)) {
      let best: Player | null = null,
        bestScore = -1e9;
      for (const m of team) {
        if (m === p || m.gk) continue;
        const ahead = (m.pos.x - p.pos.x) * d;
        const dist = m.pos.distanceTo(p.pos);
        if (dist < 5 || dist > 26 || ahead < -4) continue;
        let free = 10;
        for (const o of opp) free = Math.min(free, distToSeg(o.pos, p.pos, m.pos));
        if (free < 1.4) continue;
        const score = ahead + free * 2 + (m.you ? 12 : 0) + R() * 4;
        if (score > bestScore) (bestScore = score), (best = m);
      }
      if (best) return this.pass(p, best.you ? this.youPos : best.pos, best.you ? this.youVel : best.vel);
    }
    // dribble: push it ahead, round the nearest opponent
    const to = goal.clone().sub(bp).normalize();
    let near: Player | null = null,
      nd = 4;
    for (const o of opp) {
      const od = o.pos.distanceTo(p.pos);
      if (od < nd) (nd = od), (near = o);
    }
    if (near) {
      const away = p.pos.clone().sub(near.pos).normalize();
      const perp = new THREE.Vector2(-to.y, to.x);
      to.addScaledVector(perp, Math.sign(perp.dot(away)) * 0.8).normalize();
    }
    // stay off the boards
    if (Math.abs(this.ball.z) > PW - 2) to.y -= Math.sign(this.ball.z) * 0.6;
    to.normalize();
    const sp = (sc ? 8 : 6) + R() * 1.5;
    this.bv.set(to.x * sp, 0.3, to.y * sp);
    p.cd = 0.32;
    p.f.kick = 0.4;
    this.lastTouch = p;
  }

  private keeper(p: Player, dt: number) {
    const d = this.dir(p.team);
    const lineX = -d * PL;
    const b = this.ball,
      v = this.bv;
    let tz = THREE.MathUtils.clamp(b.z * 0.3, -GW + 0.6, GW - 0.6);
    let tx = lineX + d * 0.9;
    let sp = 4;
    // a shot coming: get across to where it crosses the line
    const toward = v.x * -d;
    const conceding = this.scripted && this.scripted.team !== p.team;
    if (toward > 4 && Math.abs(b.x - lineX) < 30) {
      const t = (lineX - b.x) / v.x;
      const zc = b.z + v.z * t;
      tz = THREE.MathUtils.clamp(zc, -GW - 0.2, GW + 0.2);
      sp = this.mode === "watch" ? 11 : 4.6;
      if (conceding) tz = -tz * 0.6;
      const lateral = Math.abs(tz - p.pos.y);
      if (lateral > 0.8 && t < 0.6) p.f.dive = THREE.MathUtils.lerp(p.f.dive, Math.sign(tz - p.pos.y) * d, Math.min(1, dt * 10));
    } else p.f.dive = THREE.MathUtils.lerp(p.f.dive, 0, Math.min(1, dt * 3));
    // a loose ball in the box: go and get it
    const inBox = Math.abs(b.x - lineX) < 8 && Math.abs(b.z) < 9 && v.length() < 7 && b.y < 1;
    if (inBox && !conceding) {
      tx = b.x;
      tz = b.z;
      sp = 4.5;
    }
    const want = new THREE.Vector2(tx, tz).sub(p.pos);
    if (want.length() > 0.1) want.setLength(Math.min(sp, want.length() * 6));
    p.vel.lerp(want, Math.min(1, dt * 8));
    p.pos.addScaledVector(p.vel, dt);
    // the save
    const reach = this.mode === "watch" ? 1.9 : 0.95 + Math.abs(p.f.dive) * 0.8;
    const dx = b.x - p.pos.x,
      dz = b.z - p.pos.y;
    if (!conceding && p.cd <= 0 && Math.hypot(dx, dz) < reach && b.y < 2.3 && Math.abs(b.x) > PL - 6) {
      const hard = v.length();
      if (hard > 4 && (this.mode === "watch" || hard < 15 || R() < 0.45)) {
        // parry out towards the wings
        this.bv.set(d * rnd(5, 9), rnd(2, 5), Math.sign(b.z || 1) * rnd(3, 7));
        p.cd = 0.8;
        this.lastTouch = p;
        this.ev.ooh();
      } else if (hard <= 4) {
        // collected: a long throw to a team-mate
        const mates = this.players.filter((m) => m.team === p.team && !m.gk);
        const to = mates[Math.floor(R() * mates.length)];
        this.ball.set(p.pos.x + d * 0.6, 1.2, p.pos.y);
        this.pass(p, to.you ? this.youPos : to.pos, to.vel);
        this.bv.y = 4;
        p.cd = 1;
      } else if (hard >= 15) p.cd = 0.5;
    }
  }

  private run(dt: number) {
    const b = this.ball;
    const bp = new THREE.Vector2(b.x, b.z);
    const playing = this.state === "play";
    for (const team of [0, 1] as const) {
      const side = this.players.filter((p) => p.team === team);
      const opp = this.players.filter((p) => p.team !== team);
      const d = this.dir(team);
      // who goes for the ball: the nearest outfield player (unless it's the visitor), and a helper
      const field = side.filter((p) => !p.gk && !p.you);
      field.sort((a, c) => a.pos.distanceToSquared(bp) - c.pos.distanceToSquared(bp));
      const youNearest = this.you.you && team === 0 && this.youPos.distanceTo(bp) < field[0].pos.distanceTo(bp);
      const chaser = youNearest ? null : field[0];
      const helper = youNearest ? field[0] : field[1];
      const bxT = b.x * d;
      for (const p of side) {
        p.cd -= dt;
        if (p.you) continue;
        if (p.gk) {
          if (this.state === "goal") p.vel.multiplyScalar(0.9), p.pos.addScaledVector(p.vel, dt);
          else this.keeper(p, dt);
          continue;
        }
        let target: THREE.Vector2;
        let sp: number;
        if (this.state === "goal") {
          // the scorers run to their fans and jump; the others trudge back
          if (team === this.scorer) {
            target = new THREE.Vector2(d * (PL - 4), Math.sign(p.fz || 0.3) * (PW - 3));
            sp = 5.5;
            p.f.cheer = Math.min(1, p.f.cheer + dt * 2);
          } else {
            target = new THREE.Vector2(p.fx * PL * 0.7 * d, p.fz * PW * 0.7);
            sp = 1.6;
          }
        } else if (this.state === "kickoff" || this.state === "out") {
          target = p.pos.clone();
          sp = 0;
          if (this.state === "kickoff" && team === this.kickoffTeam && p === field[0] && this.stateT > 1.4 && !(this.mode === "play" && team === 0)) {
            target = bp.clone().add(new THREE.Vector2(-d * 0.45, 0));
            sp = 2;
          }
        } else if (p === chaser) {
          // come at the ball from behind, facing the way you attack
          target = bp.clone().add(new THREE.Vector2(-d * 0.35, 0));
          if (p.pos.distanceTo(bp) > 3) target = bp.clone().addScaledVector(new THREE.Vector2(this.bv.x, this.bv.z), 0.25);
          const scr = this.scripted;
          sp = this.mode === "play" ? 4.9 : scr ? (scr.team === team ? 7.2 : 3.2) : 5.6;
        } else if (p === helper) {
          // support: a few metres ahead and wide of the ball
          target = new THREE.Vector2(b.x + d * 7, THREE.MathUtils.clamp(b.z + (p.fz >= 0 ? 6 : -6), -PW + 2, PW - 2));
          sp = 4.2;
        } else {
          const hx = THREE.MathUtils.clamp(p.fx * PL * 0.85 + bxT * 0.45, -PL + 3, PL - 4);
          target = new THREE.Vector2(hx * d, p.fz * PW * 0.9 + (b.z - p.fz * PW) * 0.25);
          sp = 3.4;
        }
        const want = target.sub(p.pos);
        const dist = want.length();
        if (dist > 0.15) want.setLength(Math.min(sp, dist * 3));
        else want.set(0, 0);
        p.vel.lerp(want, Math.min(1, dt * 4));
        p.pos.addScaledVector(p.vel, dt);
        if (this.state !== "goal") p.f.cheer = Math.max(0, p.f.cheer - dt * 2);
        // touch the ball
        if (playing && p.cd <= 0 && b.y < 0.9 && p.pos.distanceTo(bp) < 0.75) this.decide(p, side, opp);
      }
    }
    // nobody stands in anybody (or in the visitor)
    const all = this.players.filter((p) => !p.you);
    for (let i = 0; i < all.length; i++) {
      const a = all[i];
      for (let j = i + 1; j < all.length; j++) {
        const c = all[j];
        const dx = c.pos.x - a.pos.x,
          dz = c.pos.y - a.pos.y;
        const dd = Math.hypot(dx, dz);
        if (dd < 0.75 && dd > 1e-4) {
          const push = (0.75 - dd) / 2;
          a.pos.x -= (dx / dd) * push;
          a.pos.y -= (dz / dd) * push;
          c.pos.x += (dx / dd) * push;
          c.pos.y += (dz / dd) * push;
        }
      }
      if (this.mode === "play") {
        const dx = a.pos.x - this.youPos.x,
          dz = a.pos.y - this.youPos.y;
        const dd = Math.hypot(dx, dz);
        if (dd < 1.3 && dd > 1e-4) {
          a.pos.x += (dx / dd) * (1.3 - dd);
          a.pos.y += (dz / dd) * (1.3 - dd);
        }
      }
      a.pos.x = THREE.MathUtils.clamp(a.pos.x, -BX + 0.5, BX - 0.5);
      a.pos.y = THREE.MathUtils.clamp(a.pos.y, -BZ + 0.5, BZ - 0.5);
    }
    // the referee keeps up with play, off to one side
    const rt = new THREE.Vector2(b.x * 0.8 - 4, THREE.MathUtils.clamp(b.z - 7, -PW + 1, PW - 1));
    const rv = rt.sub(this.refPos);
    const rd = rv.length();
    this.ref.speed = Math.min(5, rd);
    if (rd > 0.5) this.refPos.addScaledVector(rv.setLength(Math.min(5, rd * 0.8)), dt);
  }

  /** The visitor's feet: run into the ball and it goes where you look; stand still and it stops. */
  private feet(dt: number, camera: THREE.Camera) {
    const p = camera.position;
    this.youPrev.copy(this.youPos);
    this.youPos.set(p.x, p.z);
    if (dt > 0) this.youVel.copy(this.youPos).sub(this.youPrev).divideScalar(dt);
    if (this.youVel.length() > 12) this.youVel.set(0, 0);
    this.you.pos.copy(this.youPos);
    this.you.vel.copy(this.youVel);
    this.youCd -= dt;
    const b = this.ball;
    const dx = b.x - p.x,
      dz = b.z - p.z;
    const dd = Math.hypot(dx, dz);
    if (dd < 0.55 + BR && b.y < 1.0 && this.state !== "goal" && this.youCd <= 0) {
      const fwd = new THREE.Vector3();
      camera.getWorldDirection(fwd);
      const f = new THREE.Vector2(fwd.x, fwd.z).normalize();
      const sp = this.youVel.length();
      if (sp > 0.6) {
        // a touch ahead: the ball runs on two or three metres, where you can see it
        const k = Math.max(5, sp * 1.75);
        this.bv.set(f.x * k, 0.8, f.y * k);
        b.x = p.x + f.x * (0.6 + BR);
        b.z = p.z + f.y * (0.6 + BR);
        this.youCd = 0.3;
      } else {
        // a trap: the ball dies at your feet
        this.bv.multiplyScalar(0.15);
        b.x = p.x + (dx / dd) * (0.56 + BR);
        b.z = p.z + (dz / dd) * (0.56 + BR);
      }
      this.lastTouch = this.you;
      if (this.state === "kickoff") this.state = "play";
    }
  }

  update(dt: number, camera: THREE.Camera) {
    dt = Math.min(dt, 0.05);
    this.camPos.copy(camera.position);
    this.stateT += dt;
    if (this.mode === "play") {
      this.feet(dt, camera);
      if (this.state === "play") this.clock += dt;
    }
    if (this.scripted) {
      this.scripted.t += dt;
      // the block's winner never fails: after a while the ball flies in from wherever it is
      if (this.scripted.t > 9 && this.state === "play") {
        const d = this.dir(this.scripted.team);
        this.aim(this.ball, d * (PL + 0.5), 1.2, (R() - 0.5) * GW, 24);
        this.scripted.t = -3;
      }
    }
    // the match states
    if (this.state === "kickoff" && this.stateT > (this.mode === "play" ? 2.2 : 2.6)) {
      this.state = "play";
      if (this.mode === "watch" || this.kickoffTeam === 1) {
        // the kick-off: a short pass back
        const d = this.dir(this.kickoffTeam);
        this.bv.set(-d * 6, 0.2, (R() - 0.5) * 6);
      }
    }
    if (this.state === "goal" && this.stateT > 4.8) this.kickoff(this.scorer === 0 ? 1 : 0, camera.position);
    if (this.state === "out" && this.stateT > 0.9) {
      this.ball.set(THREE.MathUtils.clamp(this.outAt.x, -BX + 2, BX - 2), BR + 0.6, THREE.MathUtils.clamp(this.outAt.y, -BZ + 2, BZ - 2));
      this.bv.set(0, 2, 0);
      this.state = "play";
    }
    const steps = 3;
    for (let i = 0; i < steps; i++) this.physics(dt / steps);
    // over the boards: into the crowd
    if (this.state === "play" && (Math.abs(this.ball.x) > BX + 0.3 || Math.abs(this.ball.z) > BZ + 0.3)) {
      this.state = "out";
      this.stateT = 0;
      this.outAt.set(this.ball.x, this.ball.z);
      if (Math.abs(this.ball.x) > HX || Math.abs(this.ball.z) > HZ) this.ball.set(this.ball.x, -5, this.ball.z);
    }
    // a goal?
    if (this.state === "play" && Math.abs(this.ball.x) > PL + BR && Math.abs(this.ball.z) < GW && this.ball.y < GH) {
      const team: 0 | 1 = this.ball.x > 0 ? 0 : 1;
      this.state = "goal";
      this.stateT = 0;
      this.scorer = team;
      this.score[team]++;
      const lt = this.lastTouch;
      if (lt && lt.team === team) lt.goals++;
      if (this.scripted && this.scripted.team === team) this.scripted = null;
      this.ev.goal(team, !!lt && lt.you && team === 0);
    }
    if (this.state === "out" && this.ball.y < -1) this.bv.set(0, 0, 0);
    this.run(dt);
    this.draw(dt);
  }

  private draw(dt: number) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    // shadows fall away from the four corner masts
    const masts = [
      [1, 1],
      [1, -1],
      [-1, -1],
      [-1, 1],
    ];
    let k = 0;
    const shadow = (x: number, z: number, size: number) => {
      for (const [mx, mz] of masts) {
        const dx = -mx / Math.SQRT2,
          dz = -mz / Math.SQRT2;
        q.setFromAxisAngle(up, Math.atan2(dx, dz));
        s.set(size * 0.5, 1, size * 1.6);
        m.compose(new THREE.Vector3(x + dx * 0.75 * size, 0.02 + k * 0.0003, z + dz * 0.75 * size), q, s);
        this.shadows.setMatrixAt(k++, m);
      }
    };
    for (const p of this.players) {
      const f = p.f;
      f.g.position.set(p.pos.x, 0, p.pos.y);
      const sp = p.vel.length();
      f.speed = sp;
      if (sp > 0.4) {
        const want = Math.atan2(p.vel.x, p.vel.y);
        f.g.rotation.y = lerpAngle(f.g.rotation.y, want, Math.min(1, dt * 10));
      } else if (this.state !== "goal") f.g.rotation.y = lerpAngle(f.g.rotation.y, Math.atan2(this.ball.x - p.pos.x, this.ball.z - p.pos.y), Math.min(1, dt * 4));
      f.animate(dt, this.camPos);
      if (!p.you) shadow(p.pos.x, p.pos.y, 1);
    }
    this.ref.g.position.set(this.refPos.x, 0, this.refPos.y);
    this.ref.g.rotation.y = Math.atan2(this.ball.x - this.refPos.x, this.ball.z - this.refPos.y);
    this.ref.animate(dt, this.camPos);
    shadow(this.refPos.x, this.refPos.y, 1);
    this.shadows.count = k;
    this.shadows.instanceMatrix.needsUpdate = true;
    // the ball rolls
    const b = this.ball;
    this.ballMesh.position.copy(b);
    const hv = Math.hypot(this.bv.x, this.bv.z);
    if (hv > 0.01) this.ballMesh.rotateOnWorldAxis(new THREE.Vector3(this.bv.z, 0, -this.bv.x).normalize(), (hv * dt) / BR);
    this.ballShadow.position.set(b.x, 0.025, b.z);
    const sc = Math.max(0.3, 1 - b.y * 0.12);
    this.ballShadow.scale.setScalar(sc);
    this.ballMesh.visible = this.ballShadow.visible = b.y > -1;
  }

  /** Who is this (for the info panel)? */
  playerOf(o: THREE.Object3D | null): Player | null {
    for (let x = o; x; x = x.parent) {
      const f = x.userData.footballer as Footballer | undefined;
      if (f) return this.players.find((p) => p.f === f) ?? null;
    }
    return null;
  }

  pickables() {
    return this.players.filter((p) => !p.you).map((p) => p.f.g);
  }
}

function lerpAngle(a: number, b: number, t: number) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * t;
}

function distToSeg(p: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2) {
  const ab = b.clone().sub(a);
  const t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1);
  return p.distanceTo(a.clone().addScaledVector(ab, t));
}
