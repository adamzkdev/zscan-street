import * as THREE from "three";
import { Market } from "../data/market";
import type { Block, Tx } from "../data/types";
import type { City } from "./city";
import { CURB } from "./city/plan";
import { VOX } from "./voxel/model";
import { buildFans, crowdIds, type FanSeat, type Fans } from "../interior/stadium/fans";
import { GOAL_FOR, STADIUM_GOLD, STADIUM_SILVER, WAVE, liveLines, pickOf, type Line } from "../interior/stadium/lines";
import { Shouts } from "../interior/stadium/shout";

/**
 * Block Stadium, live: Shielded against Transparent. Every block is a match day: the jumbotrons
 * keep the score of the block being played (its shielded transactions against its transparent
 * ones) and of the last 24 hours, the stands fill up with the mempool, the crowd does a wave when
 * a block lands and the side that won it scores a goal on the pitch.
 */

const MONO = '"JetBrains Mono", Menlo, monospace';
const SHIELDED_KINDS = new Set(["shielded", "migration", "shielding"]);
const KIT = { home: "#f4b728", away: "#c8ccd8" };

interface Player {
  team: 0 | 1;
  home: THREE.Vector2;
  pos: THREE.Vector2;
  vel: THREE.Vector2;
}

export class StadiumLive {
  readonly group = new THREE.Group();
  private crowd: Fans | null = null;
  private shouts: Shouts | null = null;
  private cam: THREE.Camera | null = null;
  private nextLine = 1;
  private shown = 0;
  private seats: { pos: THREE.Vector3; ang: number; tier: string }[] = [];
  private centre = new THREE.Vector3();
  private screens: { ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture }[] = [];
  private score = { home: 0, away: 0, height: 0 as number, draws: 0 };
  private goalAt = -1e9;
  private goalSide: 0 | 1 = 0;
  private waveAt = -1e9;
  private t = 0;
  private redraw = 0;
  private fill = 0.35;
  // the match on the pitch
  private pitch: { x0: number; x1: number; z0: number; z1: number; y: number } | null = null;
  private players: Player[] = [];
  private ball = new THREE.Vector2();
  private ballV = new THREE.Vector2();
  private ballMesh: THREE.Mesh | null = null;
  private torsos: THREE.InstancedMesh | null = null;
  private heads: THREE.InstancedMesh | null = null;
  private legs: THREE.InstancedMesh | null = null;
  readonly ok: boolean;

  constructor(
    scene: THREE.Object3D,
    city: City,
    private onGoal: (up: boolean) => void = () => {},
  ) {
    const st = city.landmarks.get("stadium");
    this.ok = !!st;
    if (!st) return;
    scene.add(this.group);
    const W = (p: number[]) => st.toWorld(p[0], p[1], p[2]);
    const D = (p: number[]) => st.toWorld(p[0], p[1], p[2]).sub(st.toWorld(0, 0, 0));
    const raw = st.raw;
    // ---- the stands: one seat every 0.6 m along each row, aisles left free ----
    const min = raw.pitchMin && W(raw.pitchMin),
      max = raw.pitchMax && W(raw.pitchMax);
    if (min && max) this.centre.set((min.x + max.x) / 2, min.y, (min.z + max.z) / 2);
    for (const S of ["N", "S", "E", "W"])
      for (const t of [0, 1]) {
        const a = raw[`tier${S}${t}a`],
          b = raw[`tier${S}${t}b`],
          step = raw[`rowStep${S}${t}`],
          rows = raw[`rows${S}${t}`];
        if (!a || !b || !step || !rows) continue;
        // the landmark's points are at twice its design scale (k): rows count and step are both
        // doubled, and the north and south rows step sideways; here every row steps outward,
        // half as many, and nothing lands past the stands' outer ring
        const pmn = raw.pitchMin,
          pmx = raw.pitchMax;
        if (!pmn || !pmx) continue;
        const pcx = (pmn[0] + pmx[0]) / 2,
          pcz = (pmn[2] + pmx[2]) / 2,
          phx = (pmx[0] - pmn[0]) / 2,
          phz = (pmx[2] - pmn[2]) / 2;
        const k = raw.tierE0a ? Math.max(1, Math.round(((raw.tierE0a[0] - pmx[0]) * 0.8) / 5.5)) : 1;
        const out = S === "N" ? [0, -1] : S === "S" ? [0, 1] : S === "W" ? [-1, 0] : [1, 0];
        const stepOut = Math.abs(step[0]) + Math.abs(step[2]);
        const nRows = Math.round(rows[0] / k);
        const sOf = (x: number, z: number) => Math.hypot(Math.max(Math.abs(x - pcx) - phx, 0) * 0.8, Math.max(Math.abs(z - pcz) - phz, 0));
        const A = W(a),
          B = W(b);
        const len = A.distanceTo(B);
        const lenVox = Math.hypot(b[0] - a[0], b[2] - a[2]);
        for (let r = 0; r < nRows; r++)
          for (let d = 0.3; d < len; d += 0.62) {
            // aisles: 2 voxels (at this scale) every 30 along the stand
            const u = (d / len) * lenVox;
            if (u % 60 < 4) continue;
            const f = d / len;
            const vx = a[0] + (b[0] - a[0]) * f + out[0] * stepOut * r,
              vz = a[2] + (b[2] - a[2]) * f + out[1] * stepOut * r,
              vy = a[1] + step[1] * r;
            if (sOf(vx, vz) > 42 * k) continue;
            const p = W([vx, vy, vz]);
            this.seats.push({ pos: p, ang: Math.atan2(p.z - this.centre.z, p.x - this.centre.x), tier: S + t });
          }
      }
    // shuffled, so the first n are a scattered crowd of any size
    for (let i = this.seats.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.seats[i], this.seats[j]] = [this.seats[j], this.seats[i]];
    }
    if (this.seats.length) {
      // a zkSNARK on every seat, each a different one: gold Shielded, the east end silver
      const ids = crowdIds(this.seats.length, 31);
      const fanSeats: FanSeat[] = this.seats.map((s, i) => {
        const away = Math.cos(s.ang) > 0.75;
        const r = Math.random();
        const team = away ? (r < 0.9 ? 1 : 0) : r < 0.08 ? 1 : r < 0.18 ? 2 : 0;
        const k = Math.random();
        const shirts = team === 1 ? ["#c8ccd8", "#c8ccd8", "#2a3040", "#f2f4f8"] : team === 2 ? ["#e8e4dc", "#3987e5", "#1baf7a"] : ["#f4b728", "#f4b728", "#1a1820", "#c88d12"];
        return {
          x: s.pos.x,
          y: s.pos.y - 0.2,
          z: s.pos.z,
          rot: Math.atan2(this.centre.x - s.pos.x, this.centre.z - s.pos.z),
          ang: s.ang,
          team,
          kind: k < 0.015 ? 2 : k < 0.12 ? 1 : 0,
          shirt: shirts[Math.floor(Math.random() * shirts.length)],
          id: ids[i],
        };
      });
      this.crowd = buildFans(fanSeats, { lod: 70, fog: true, bright: 1.15 });
      // the camera, for the bubbles: caught as the crowd is drawn
      this.crowd.group.children[0].onBeforeRender = (_r, _s, cam) => (this.cam = cam);
      this.group.add(this.crowd.group);
      this.shouts = new Shouts(this.crowd, 3, true);
      Object.assign(this.shouts, { size: 0.03, minH: 0.8, maxH: 3, range: 120 });
      this.group.add(this.shouts.group);
      this.placeCrowd();
    }
    // ---- the jumbotrons ----
    const size = raw.screenSize ? [raw.screenSize[0] * VOX, raw.screenSize[1] * VOX] : [16, 7.3];
    for (const [k, facing] of [
      ["screenA", [1, 0, 0]],
      ["screenB", [-1, 0, 0]],
    ] as const) {
      if (!raw[k]) continue;
      const c = document.createElement("canvas");
      c.width = 640;
      c.height = Math.round((640 * size[1]) / size[0]);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1]), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(1.3, 1.3, 1.3) }));
      const n = D([...facing]).normalize();
      m.position.copy(W(raw[k])).addScaledVector(n, 0.15);
      m.rotation.y = Math.atan2(n.x, n.z);
      this.group.add(m);
      this.screens.push({ ctx: c.getContext("2d")!, tex });
    }
    // ---- floodlights for the night match: real lights over the pitch ----
    if (min && max) {
      for (const [x, z] of [
        [min.x + 8, min.z + 6],
        [max.x - 8, min.z + 6],
        [min.x + 8, max.z - 6],
        [max.x - 8, max.z - 6],
      ])
        city.lamps.push({ pos: new THREE.Vector3(x, min.y + 14, z), color: "#dfeaff", intensity: 40 });
      this.pitch = { x0: Math.min(min.x, max.x) + 1.5, x1: Math.max(min.x, max.x) - 1.5, z0: Math.min(min.z, max.z) + 1.5, z1: Math.max(min.z, max.z) - 1.5, y: min.y + 0.05 };
      this.team();
    }
    Market.subscribe(() => (this.redraw = 0));
  }

  /** Five a side, gold (shielded) against silver (transparent). */
  private team() {
    const P = this.pitch!;
    const cx = (P.x0 + P.x1) / 2,
      cz = (P.z0 + P.z1) / 2;
    const L = (P.x1 - P.x0) / 2,
      Wd = (P.z1 - P.z0) / 2;
    const shape: [number, number][] = [
      [-0.9, 0],
      [-0.55, -0.45],
      [-0.55, 0.45],
      [-0.2, -0.2],
      [-0.15, 0.3],
    ];
    for (const team of [0, 1] as const)
      for (const [fx, fz] of shape) {
        const dir = team === 0 ? 1 : -1;
        const home = new THREE.Vector2(cx + fx * L * dir, cz + fz * Wd);
        this.players.push({ team, home, pos: home.clone(), vel: new THREE.Vector2() });
      }
    this.ball.set(cx, cz);
    const mk = (geo: THREE.BufferGeometry, color?: string) => {
      const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: color ?? "#ffffff", roughness: 0.7 }), this.players.length);
      m.frustumCulled = false;
      this.group.add(m);
      return m;
    };
    this.legs = mk(new THREE.BoxGeometry(0.4, 0.75, 0.3).translate(0, 0.375, 0), "#1a1820");
    this.torsos = mk(new THREE.BoxGeometry(0.55, 0.7, 0.36).translate(0, 1.1, 0));
    this.heads = mk(new THREE.BoxGeometry(0.4, 0.4, 0.4).translate(0, 1.66, 0), "#c08a5a");
    const c = new THREE.Color();
    this.players.forEach((p, i) => this.torsos!.setColorAt(i, c.set(p.team === 0 ? KIT.home : KIT.away)));
    this.ballMesh = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.4 }));
    this.group.add(this.ballMesh);
  }

  /** A block landed: the score of its match, the wave, and a goal for whoever won it. */
  block(b: Block) {
    const txs = b.txs as Tx[];
    const home = txs.filter((t) => SHIELDED_KINDS.has(t.kind)).length;
    const away = txs.length - home;
    this.score = { home, away, height: b.height, draws: 0 };
    this.waveAt = this.t;
    this.say(pickOf(WAVE));
    if (home !== away) for (let k = 0; k < 5; k++) this.say(home > away ? pickOf(GOAL_FOR) : ["TRANSPARENT!!", "silver"], home > away ? 0 : 1, k * 0.2);
    if (home > away) this.say([`BLOCK ${b.height.toLocaleString("en-US")} BABY!`, "shout"], 0, 1.1);
    if (home !== away) {
      this.goalAt = this.t;
      this.goalSide = home > away ? 0 : 1;
      this.onGoal(home > away);
      // the ball flies into the losing side's net
      if (this.pitch) {
        const P = this.pitch;
        const goal = new THREE.Vector2(this.goalSide === 0 ? P.x1 + 1.2 : P.x0 - 1.2, (P.z0 + P.z1) / 2);
        this.ballV.copy(goal).sub(this.ball).multiplyScalar(0.9);
      }
    }
    this.redraw = 0;
  }

  /** How full the stands are: a quiet mempool, a third; a busy one, sold out. */
  setMempool(n: number) {
    this.fill = Math.min(1, 0.3 + n / 30);
  }

  private say([text, style]: Line, team?: 0 | 1, delay = 0) {
    const fans = this.crowd;
    if (!fans || !this.shouts) return;
    const n = this.shown;
    this.shouts.say(text, style, { delay, near: (i) => i < n && (team === undefined || (team === 1) === (fans.seats[i].team === 1)) });
  }

  /** The crowd on the GPU: how many are in, the wave, the goal's jump. */
  private placeCrowd() {
    const fans = this.crowd;
    if (!fans) return;
    const n = Math.round(this.seats.length * this.fill);
    if (n !== this.shown) fans.setCount((this.shown = n));
    fans.tick(this.t);
    const u = fans.uniforms;
    const waveT = this.t - this.waveAt;
    if (waveT < 7) u.uWave.value.set(-Math.PI + (waveT / 7) * Math.PI * 4, Math.min(1, waveT * 2, (7 - waveT) * 2));
    else u.uWave.value.set(0, 0);
    const gt = this.t - this.goalAt;
    const g = gt < 5 ? Math.min(1, gt * 4) * Math.min(1, (5 - gt) / 1.5) : 0;
    u.uCheer.value.set(this.goalSide === 0 ? g : 0, this.goalSide === 1 ? g : 0, 0);
    u.uScarf.value += ((gt < 8 ? 1 : 0.2) - u.uScarf.value) * 0.05;
  }

  private drawScreens() {
    const net = Market.state.network;
    for (const { ctx, tex } of this.screens) {
      const w = ctx.canvas.width,
        h = ctx.canvas.height;
      const goal = this.t - this.goalAt < 4.5;
      ctx.fillStyle = "#05060a";
      ctx.fillRect(0, 0, w, h);
      ctx.textAlign = "center";
      if (goal && Math.floor(this.t * 4) % 2 === 0) {
        ctx.fillStyle = this.goalSide === 0 ? KIT.home : KIT.away;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#05060a";
        ctx.font = `900 ${h * 0.42}px ${MONO}`;
        ctx.fillText("GOAL!", w / 2, h * 0.55);
        ctx.font = `800 ${h * 0.13}px ${MONO}`;
        ctx.fillText(this.goalSide === 0 ? "SHIELDED SCORES" : "TRANSPARENT SCORES", w / 2, h * 0.82);
      } else {
        ctx.fillStyle = "#8a8896";
        ctx.font = `700 ${h * 0.09}px ${MONO}`;
        ctx.fillText(this.score.height ? `BLOCK #${this.score.height.toLocaleString("en-US")} · FULL TIME` : "BLOCK STADIUM · KICK-OFF AT THE NEXT BLOCK", w / 2, h * 0.14);
        // the score
        ctx.font = `800 ${h * 0.12}px ${MONO}`;
        ctx.fillStyle = KIT.home;
        ctx.fillText("SHIELDED", w * 0.24, h * 0.32);
        ctx.fillStyle = KIT.away;
        ctx.fillText("TRANSPARENT", w * 0.76, h * 0.32);
        ctx.font = `900 ${h * 0.34}px ${MONO}`;
        ctx.fillStyle = "#ffffff";
        ctx.fillText(String(this.score.home), w * 0.24, h * 0.66);
        ctx.fillText(String(this.score.away), w * 0.76, h * 0.66);
        ctx.fillStyle = "#4a4856";
        ctx.fillText("–", w / 2, h * 0.64);
        // the season: the last 24 h, as a bar
        const r = net?.shielded_tx_ratio_24h;
        ctx.fillStyle = "#8a8896";
        ctx.font = `600 ${h * 0.075}px ${MONO}`;
        ctx.fillText(r !== undefined ? `LAST 24 H · ${Math.round(r * 100)}% SHIELDED` : "LAST 24 H", w / 2, h * 0.8);
        const bx = w * 0.12,
          bw = w * 0.76,
          by = h * 0.86,
          bh = h * 0.06;
        ctx.fillStyle = KIT.away;
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = KIT.home;
        ctx.fillRect(bx, by, bw * (r ?? 0.5), bh);
      }
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
      tex.needsUpdate = true;
    }
  }

  private play(dt: number) {
    const P = this.pitch;
    if (!P || !this.torsos) return;
    const ball = this.ball;
    // the ball rolls and slows; out of play it comes back to the centre spot
    ball.addScaledVector(this.ballV, dt);
    this.ballV.multiplyScalar(Math.pow(0.55, dt));
    if (ball.x < P.x0 - 2 || ball.x > P.x1 + 2 || ball.y < P.z0 - 1 || ball.y > P.z1 + 1 || (this.t - this.goalAt > 3 && this.t - this.goalAt < 3.1)) {
      ball.set((P.x0 + P.x1) / 2, (P.z0 + P.z1) / 2);
      this.ballV.set(0, 0);
    }
    if (ball.y < P.z0) (ball.y = P.z0), (this.ballV.y *= -1);
    if (ball.y > P.z1) (ball.y = P.z1), (this.ballV.y *= -1);
    // the nearest player of each side goes for the ball; the rest keep their shape, shifted with play
    const shift = (ball.x - (P.x0 + P.x1) / 2) * 0.5;
    for (const team of [0, 1] as const) {
      const side = this.players.filter((p) => p.team === team);
      let chaser = side[0];
      for (const p of side) if (p.pos.distanceTo(ball) < chaser.pos.distanceTo(ball)) chaser = p;
      for (const p of side) {
        const target = p === chaser ? ball.clone() : new THREE.Vector2(p.home.x + shift, p.home.y + (ball.y - p.home.y) * 0.25);
        const want = target.sub(p.pos);
        const speed = p === chaser ? 6.5 : 3;
        if (want.length() > 0.3) want.setLength(speed);
        else want.set(0, 0);
        p.vel.lerp(want, Math.min(1, dt * 3));
        p.pos.addScaledVector(p.vel, dt);
        // a kick: towards the other side's goal, a bit at random
        if (p === chaser && p.pos.distanceTo(ball) < 0.7 && this.ballV.length() < 4 && this.t - this.goalAt > 3) {
          const goalX = team === 0 ? P.x1 : P.x0;
          const aim = new THREE.Vector2(goalX, (P.z0 + P.z1) / 2 + (Math.random() - 0.5) * (P.z1 - P.z0) * 0.8).sub(ball);
          this.ballV.copy(aim.setLength(5 + Math.random() * 7)).rotateAround(new THREE.Vector2(), (Math.random() - 0.5) * 0.9);
        }
      }
    }
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    this.players.forEach((p, i) => {
      q.setFromAxisAngle(up, Math.atan2(p.vel.x, p.vel.y));
      m.compose(new THREE.Vector3(p.pos.x, P.y, p.pos.y), q, new THREE.Vector3(1.4, 1.4, 1.4));
      for (const mesh of [this.legs!, this.torsos!, this.heads!]) mesh.setMatrixAt(i, m);
    });
    for (const mesh of [this.legs!, this.torsos!, this.heads!]) mesh.instanceMatrix.needsUpdate = true;
    this.ballMesh!.position.set(ball.x, P.y + 0.3, ball.y);
  }

  update(dt: number, visible: boolean) {
    this.t += dt;
    if (!this.ok) return;
    this.group.visible = visible;
    if (!visible) return;
    this.play(dt);
    const live = this.t - this.waveAt < 7 || this.t - this.goalAt < 4.5;
    this.redraw -= dt;
    if (this.redraw <= 0 || (live && Math.floor(this.t * 8) !== Math.floor((this.t - dt) * 8))) {
      this.drawScreens();
      if (this.redraw <= 0) this.redraw = 2;
    }
    this.placeCrowd();
    if (this.shouts && this.cam) {
      // a line now and then from the stands, when the camera is near enough to read it
      this.nextLine -= dt;
      if (this.nextLine <= 0 && this.shouts.busy < this.shouts.max - 2) {
        this.nextLine = 2.5 + Math.random() * 3;
        const r = Math.random();
        const live = liveLines(this.score.height || null);
        if (r < 0.2 && live.length) this.say(pickOf(live), 0);
        else if (r < 0.35) this.say(pickOf(STADIUM_SILVER), 1);
        else this.say(pickOf(STADIUM_GOLD), 0);
      }
      this.shouts.tick(dt, this.cam);
      // seen from the iso view: the zkSNARKs' portraits once zoomed in, coloured blocks further out
      const ov = this.shouts.orthoView;
      if (this.crowd) this.crowd.uniforms.uLod.value = ov ? (ov < 90 ? 1e6 : 0) : 70;
      // bubbles only when the view is close enough to read them
      this.shouts.group.visible = !ov || ov < 90;
    }
  }
}

void CURB;
