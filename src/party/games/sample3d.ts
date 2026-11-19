/**
 * The smallest 3D mini-game: the pattern every 3D game follows (not in the rotation; the bench
 * plays it with /partylab.html?g=sample). Four zkSNARKs on a round island grab the coins that pop
 * up; most coins in 15 seconds wins.
 */
import * as THREE from "three";
import { rankBy, sfx, type Input, type Mini, type MiniDef, type Player, type Rnd } from "../kit";
import { Avatar, CamRig, Fx3, GEO, blob, clock, coin, corners, disposeScene, skyDome, skyline, tag, toScreen, toon, world, yawOf } from "../k3";

const TIME = 15;
const LOOK_SKY = typeof location !== "undefined" && new URLSearchParams(location.search).get("look") === "sky";
const R = 9;

class Sample implements Mini {
  private w = world({ sky: ["#58b4ff", "#d8f2ff"] });
  private av: Avatar[];
  private fx: Fx3;
  private cam: CamRig;
  private coins: { g: THREE.Group; shadow: THREE.Mesh; x: number; z: number }[] = [];
  private score = [0, 0, 0, 0];
  private t = 0;
  private over: number[] | null = null;
  private v = new THREE.Vector3();

  constructor(
    private players: Player[],
    private rnd: Rnd,
  ) {
    const s = this.w.scene;
    const island = new THREE.Mesh(GEO.cyl, toon("#7ccf5a"));
    island.scale.set(R * 2, 1, R * 2);
    island.position.y = -0.5;
    s.add(island);
    const cliff = new THREE.Mesh(GEO.cyl, toon("#b98a5a"));
    cliff.scale.set(R * 2 - 0.4, 6, R * 2 - 0.4);
    cliff.position.y = -4;
    s.add(cliff);
    skyline(s, { r: 120, rnd });
    // (the sky all round: clouds and a sun by day; the bench's `&dome=night`: stars and a moon)
    if (typeof location !== "undefined" && new URLSearchParams(location.search).get("dome") === "night") skyDome(s, { sky: ["#070418", "#2a1a5e"], stars: 700, band: true, disc: { az: 150, el: 32, moon: true }, rnd });
    else skyDome(s, { sky: ["#3b8cff", "#d8f2ff"], clouds: 16, disc: { az: 205, el: 30 }, rnd });
    this.av = players.map((p, i) => {
      const a = new Avatar(s, p);
      const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
      a.pos.set(Math.sin(ang) * 4, 0, Math.cos(ang) * 4);
      a.yaw = yawOf(-a.pos.x, -a.pos.z);
      a.sync(0);
      return a;
    });
    for (let i = 0; i < 6; i++) this.addCoin();
    this.fx = new Fx3(s);
    this.cam = new CamRig(this.w.camera);
    this.cam.set(new THREE.Vector3(0, 15, 17), new THREE.Vector3(0, 0, 1));
  }

  private addCoin() {
    const a = this.rnd() * Math.PI * 2;
    const d = Math.sqrt(this.rnd()) * (R - 1.2);
    const g = coin(0.45);
    const x = Math.sin(a) * d,
      z = Math.cos(a) * d;
    g.position.set(x, 0.8, z);
    const shadow = blob(0.35);
    shadow.position.set(x, 0.03, z);
    this.w.scene.add(g, shadow);
    this.coins.push({ g, shadow, x, z });
  }

  idle(dt: number, phase: "card" | "count", k: number) {
    // the card: a slow circle; the 3-2-1: down to the game's own camera
    if (phase === "card") this.cam.orbit(new THREE.Vector3(0, 0, 0), k * 0.25, 20, 9);
    else this.cam.to(new THREE.Vector3(0, 15, 17), new THREE.Vector3(0, 0, 1), dt, 3);
    this.cam.apply(dt);
    for (const a of this.av) (a.physics(dt), a.sync(dt));
    this.spin();
  }

  update(dt: number, input: Input) {
    this.t += dt;
    if (!this.over && this.t >= TIME) {
      this.over = rankBy(this.score);
      this.av[this.over[0]].cheer(3);
    }
    this.av.forEach((a, i) => {
      let mx = 0,
        mz = 0;
      if (!this.over) {
        if (this.players[i].human) {
          const ax = input.axis();
          mx = ax.x;
          mz = ax.y;
        } else {
          // the AI: to the nearest coin, a little lazy when not so good
          let best = Infinity;
          for (const c of this.coins) {
            const d = Math.hypot(c.x - a.pos.x, c.z - a.pos.z);
            if (d < best) ((best = d), (mx = c.x - a.pos.x), (mz = c.z - a.pos.z));
          }
          const l = Math.hypot(mx, mz) || 1;
          const k = 0.55 + this.players[i].skill * 0.4;
          mx = (mx / l) * k;
          mz = (mz / l) * k;
        }
      }
      const sp = 7;
      a.pos.x += mx * sp * dt;
      a.pos.z += mz * sp * dt;
      if (mx || mz) a.face(yawOf(mx, mz), dt);
      // (the island's edge holds them)
      const r = Math.hypot(a.pos.x, a.pos.z);
      if (r > R - 0.6) a.pos.multiplyScalar((R - 0.6) / r);
      a.physics(dt, 0);
      a.sync(dt);
      for (const c of this.coins)
        if (!this.over && Math.hypot(c.x - a.pos.x, c.z - a.pos.z) < 0.9) {
          this.score[i]++;
          this.fx.burst(this.v.set(c.x, 1, c.z), 14, ["#ffd23f", "#fff4c4"], { speed: 4, up: 5 });
          c.g.removeFromParent();
          c.shadow.removeFromParent();
          this.coins = this.coins.filter((q) => q !== c);
          if (this.players[i].human) sfx.coin();
          this.addCoin();
          break;
        }
    });
    this.spin();
    this.fx.update(dt);
    // (the bench's `&look=sky`: the camera low, looking at the horizon, to check a sky dome)
    if (LOOK_SKY) this.cam.set(new THREE.Vector3(0, 2.5, 22), new THREE.Vector3(Math.sin(this.t * 0.25) * 30, 9, -20));
    this.cam.apply(dt);
  }

  private spin() {
    for (const c of this.coins) c.g.rotation.y += 0.06;
  }

  view() {
    return this.w;
  }

  draw(g: CanvasRenderingContext2D) {
    for (const a of this.av) {
      const s = toScreen(a.head(this.v), this.w.camera);
      if (s.on) tag(g, a.player, s.x, s.y);
    }
    corners(g, this.players, this.score.map(String));
    clock(g, TIME - this.t);
  }

  result() {
    return this.over;
  }

  dispose() {
    for (const a of this.av) a.dispose();
    disposeScene(this.w.scene);
  }
}

export const SAMPLE: MiniDef = {
  key: "sample",
  title: "COIN SCRAMBLE",
  titleZh: "抢金币",
  tag: "The pattern of a 3D game",
  tagZh: "3D 小游戏的样板",
  help: "Run with the arrows. Grab the coins: most in 15 seconds wins.",
  helpZh: "方向键跑动，抢金币：15 秒内最多者胜。",
  pad: ["left", "right", "up", "down"],
  tap: false,
  color: "#ffd23f",
  make: (players, rnd) => new Sample(players, rnd),
};
