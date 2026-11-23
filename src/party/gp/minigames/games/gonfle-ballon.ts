/**
 * GONFLE LE BALLON (chacun pour soi, ≤ 40 s): four fairground stands, each player at a big hand
 * pump with a balloon of their colour. Mash A to pump: the balloon swells, wobbles, trembles… and
 * pops in a burst of confetti; a new one is tied on. The balloon leaks a little if you stop.
 * First to pop 3 balloons wins; the others rank by balloons popped, then by the current size.
 */
import * as THREE from "three";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef } from "../types";
import { GEO, ball, box, canvasTex, cone, cyl, flat, group, toon, tree, cloud, FONT_TITLE } from "../../engine/gfx";
import { clamp, damp, easeOutBack } from "../../engine/util";
import { music, sfx } from "../../engine/audio";
import { T } from "../../../../i18n/lang";

const TIME = 40;
const GOAL = 3;
/** Pumps needed for balloon 1, 2, 3 (each a bit bigger). */
const PUMPS = [34, 40, 46];
const LEAK = 0.035; // of a balloon per second
const SPACING = 4.7;
const AV_SCALE = 1.25;
const RMIN = 0.22;
const RMAX = 1.18;
const DECK = 0.24;
/** The crate each pumper stands on (a zkSNARK's hands are low: they reach the handle from it). */
const STEP = 0.22;

interface Stand {
  x: number;
  /** Air in the current balloon, 0..1 (pops at 1). */
  f: number;
  popped: number;
  /** Plunger position 0 (up) … 1 (down). */
  plunger: number;
  /** Wobble spring. */
  w: number;
  wv: number;
  /** Seconds before the new balloon is tied on (pumping does nothing meanwhile). */
  tie: number;
  /** Time since the new balloon appeared (for its pop-in). */
  age: number;
  rod: THREE.Object3D;
  balloon: THREE.Group;
  body: THREE.Object3D;
  mat: THREE.MeshToonMaterial;
  nozzle: THREE.Vector3;
  hot: boolean;
  pumps: number;
}
interface CpuState {
  rate: number;
  pause: number;
  nextPause: number;
}

/** A teardrop balloon profile (lathe), radius 1 at the equator, knot at y ≈ -1.15. */
function balloonGeo() {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 20; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / 20;
    let r = Math.cos(a);
    let y = Math.sin(a);
    if (y < 0) {
      r *= 1 + 0.28 * y;
      y *= 1.15;
    }
    pts.push(new THREE.Vector2(Math.max(0.001, r), y));
  }
  return new THREE.LatheGeometry(pts, 28);
}

class GonfleBallon extends BaseMini {
  private st: Stand[] = [];
  private cpus: CpuState[] = [];
  private cardVals: HTMLElement[] = [];
  private bGeo = balloonGeo();
  private wheel!: THREE.Group;
  private cabins: THREE.Object3D[] = [];
  private bulbs: THREE.Mesh[] = [];
  private bulbMats: THREE.MeshBasicMaterial[] = [];
  private hurried = false;
  private over = false;
  private endIn = 0;
  private leader = -1;
  private decoT = 0;

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#3b4fb8", "#ffb27a"], size: 16, sun: [-0.4, 0.9, 0.7], sunColor: "#ffe2bf", fog: { near: 40, far: 110 } });
    const n = this.players.length;
    this.buildFair();
    this.players.forEach((p, i) => {
      const x = (i - (n - 1) / 2) * SPACING;
      this.buildStand(i, x);
      const a = this.spawn(i, x - 0.75, 0.02, 0, { scale: AV_SCALE });
      a.pos.y = DECK + STEP;
      a.groundY = DECK + STEP;
      a.anim = "hold";
      a.setRing(p.char.color);
      const lv = p.level;
      this.cpus.push({ rate: 9.6 * (0.94 + Math.random() * 0.12), pause: 0, nextPause: 1.5 + Math.random() * 3 + lv * 2 });
    });
    const cards = this.hud.players(this.players, () => this.balloonsHtml(0));
    this.cardVals = this.players.map((_, i) => cards.children[i]?.querySelector(".val") as HTMLElement);
    this.hud.timer(TIME);
    this.hud.tip(T(`Mash <span class="key a">A</span> to pump: pop 3 balloons!`, `狂按 <span class="key a">A</span> 打气：吹爆 3 个气球！`));
    this.setCam([0, 7, 22], [0, 3, 0], 40);
  }

  private balloonsHtml(k: number) {
    let s = "";
    for (let i = 0; i < GOAL; i++) s += `<span style="opacity:${i < k ? 1 : 0.22};font-size:.8em">🎈</span>`;
    return s;
  }

  // ------------------------------------------------------------ the fair

  private buildFair() {
    const s = this.scene;
    // ground: trodden earth in front, grass beyond
    const dirt = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = "#d9b98a";
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 400; i++) {
        g.fillStyle = Math.random() < 0.5 ? "rgba(120,80,40,0.12)" : "rgba(255,255,255,0.1)";
        g.beginPath();
        g.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 0, Math.PI * 2);
        g.fill();
      }
    }, true);
    dirt.repeat.set(6, 3);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 26), new THREE.MeshToonMaterial({ map: dirt }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, 4);
    ground.receiveShadow = true;
    s.add(ground);
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(260, 200), toon("#6fbf5a"));
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(0, -0.03, -40);
    grass.receiveShadow = true;
    s.add(grass);
    // the Ferris wheel behind
    const wx = -9,
      wz = -26,
      wr = 10,
      wy = 12.5;
    const legs = group(s, { x: wx, z: wz });
    for (const sz of [-1.2, 1.2])
      for (const sx of [-1, 1]) box(legs, "#e8e8f0", 0.4, 13.6, 0.4, { x: sx * 3.2, y: 6.2, z: sz, rz: sx * 0.25 });
    cyl(legs, "#c0c4d0", 0.6, 2.8, { y: wy, rx: Math.PI / 2, seg: 16 });
    this.wheel = group(s, { x: wx, y: wy, z: wz });
    for (const sz of [-1, 1]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(wr, 0.18, 8, 64), toon("#ffffff"));
      rim.position.z = sz;
      this.wheel.add(rim);
    }
    const bulbCols = ["#ff4b3e", "#ffd23f", "#3fcf5a", "#2f8dff", "#ff7ad9"];
    this.bulbMats = bulbCols.map((c) => new THREE.MeshBasicMaterial({ color: c }));
    const N = 12;
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2;
      for (const sz of [-1, 1]) box(this.wheel, "#ff5a8a", 0.14, wr, 0.14, { x: (Math.cos(a) * wr) / 2, y: (Math.sin(a) * wr) / 2, z: sz, rz: a - Math.PI / 2, cast: false });
      const cab = group(s, {});
      box(cab, bulbCols[k % bulbCols.length], 1.4, 1.1, 1.6, { y: -0.9 });
      box(cab, "#ffffff", 1.6, 0.18, 1.8, { y: -0.3 });
      cyl(cab, "#888899", 0.04, 0.5, { y: -0.1, seg: 6 });
      cab.userData.a = a;
      this.cabins.push(cab);
      for (let b = 0; b < 4; b++) {
        const aa = a + (b / 4) * ((Math.PI * 2) / N);
        const m = new THREE.Mesh(GEO.sphereLo, this.bulbMats[(k + b) % bulbCols.length]);
        m.scale.setScalar(0.22);
        m.position.set(Math.cos(aa) * wr, Math.sin(aa) * wr, 1.25);
        this.wheel.add(m);
        this.bulbs.push(m);
      }
    }
    // a big top on the right
    const stripes = canvasTex(512, 64, (g, w, h) => {
      for (let i = 0; i < 16; i++) {
        g.fillStyle = i % 2 ? "#ffffff" : "#e8323a";
        g.fillRect((i * w) / 16, 0, w / 16, h);
      }
    });
    const top = group(s, { x: 14, z: -22 });
    mesh2(top, new THREE.CylinderGeometry(7, 7, 6, 32, 1, true), new THREE.MeshToonMaterial({ map: stripes, side: THREE.DoubleSide }), { y: 3 });
    mesh2(top, new THREE.ConeGeometry(7.6, 5, 32), new THREE.MeshToonMaterial({ map: stripes }), { y: 8.5 });
    cyl(top, "#ffd23f", 0.1, 2, { y: 11.8, seg: 6 });
    box(top, "#e8323a", 1.4, 0.8, 0.04, { x: 0.7, y: 12.4 });
    box(top, "#3a1f3f", 2.6, 3.6, 0.2, { y: 1.8, z: 6.95 });
    // stalls and trees far back
    for (let k = 0; k < 7; k++) {
      const x = -30 + k * 10 + (k > 3 ? 6 : 0);
      if (Math.abs(x - 14) < 8) continue;
      const g = group(s, { x, z: -14 - (k % 2) * 4 });
      box(g, k % 2 ? "#ffe0a8" : "#bfe4ff", 3.4, 2.4, 2.4, { y: 1.2 });
      box(g, k % 2 ? "#3d8bff" : "#ff7ad9", 3.8, 0.4, 2.8, { y: 2.6 });
      cone(g, k % 2 ? "#ff4b3e" : "#ffd23f", 2.5, 1.4, { y: 3.5, lo: true });
    }
    for (let k = 0; k < 14; k++) {
      const x = -40 + k * 6.5 + Math.random() * 2;
      tree(s, x, -34 - Math.random() * 6, 2.2 + Math.random(), k % 2 ? "#4fae4a" : "#5cbf55");
    }
    for (let k = 0; k < 5; k++) cloud(s, -30 + k * 15, 18 + Math.random() * 5, -50 - Math.random() * 10, 2 + Math.random());
    // a garland of bulbs over the stands
    const n = this.players.length;
    const L = (n * SPACING) / 2 + 1;
    for (let k = 0; k <= 36; k++) {
      const t = k / 36;
      const x = -L + 2 * L * t;
      const y = 6.4 - Math.abs(Math.sin(t * Math.PI * n)) * 0.6;
      const m = new THREE.Mesh(GEO.sphereLo, this.bulbMats[k % this.bulbMats.length]);
      m.scale.setScalar(0.12);
      m.position.set(x, y, 1.9);
      s.add(m);
      this.bulbs.push(m);
    }
    // side lamp posts
    for (const sx of [-1, 1]) {
      const g = group(s, { x: sx * (L + 0.6), z: 1.9 });
      cyl(g, "#2d2d48", 0.1, 6.6, { y: 3.3, seg: 8 });
      ball(g, toon("#fff3b0", "#ffcc33", 0.9), 0.3, { y: 6.7 });
    }
  }

  private buildStand(i: number, x: number) {
    const s = this.scene;
    const p = this.players[i];
    const col = p.char.color;
    const g = group(s, { x });
    const W = SPACING - 0.35;
    // deck, back wall, posts
    box(g, "#b07a4a", W, 0.24, 3.4, { y: 0.12, z: -0.2 });
    box(g, "#8a5a32", W + 0.1, 0.08, 0.2, { y: 0.26, z: 1.5 });
    box(g, i % 2 ? "#fff3dc" : "#ffe8c2", W, 5, 0.2, { y: 2.6, z: -1.8 });
    box(g, col, W, 0.35, 0.24, { y: 0.45, z: -1.75 });
    for (const sx of [-1, 1]) {
      cyl(g, "#f4f4f4", 0.11, 5.6, { x: sx * (W / 2 - 0.1), y: 2.8, z: 1.5, seg: 10 });
      cyl(g, "#f4f4f4", 0.11, 5.6, { x: sx * (W / 2 - 0.1), y: 2.8, z: -1.6, seg: 10 });
    }
    // striped awning + scalloped edge
    const k = 7;
    for (let j = 0; j < k; j++) {
      const sx = -W / 2 + (W / k) * (j + 0.5);
      box(g, j % 2 ? "#ffffff" : col, W / k, 0.16, 3.6, { x: sx, y: 5.6, z: -0.15, rx: -0.18 });
      ball(g, j % 2 ? "#ffffff" : col, [W / k / 2, 0.28, 0.1], { x: sx, y: 5.15, z: 1.75, lo: true, cast: false });
    }
    // the sign with the name
    const tex = canvasTex(512, 128, (c, w, h) => {
      c.fillStyle = "#1d1630";
      c.beginPath();
      c.roundRect(0, 0, w, h, 40);
      c.fill();
      c.fillStyle = col;
      c.beginPath();
      c.roundRect(8, 8, w - 16, h - 16, 34);
      c.fill();
      c.fillStyle = new THREE.Color(col).getHSL({ h: 0, s: 0, l: 0 }).l > 0.6 ? "#1d1630" : "#ffffff";
      c.font = `84px ${FONT_TITLE}`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(p.name, w / 2, h / 2 + 5);
    });
    const sign = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    sign.scale.set(2.8, 0.7, 1);
    sign.position.set(0, 6.25, 1.9);
    g.add(sign);
    // prizes on two shelves (plush balls, a few big ones)
    const prize = ["#ff7ad9", "#ffd23f", "#7ad7ff", "#a6ff8a", "#ffb27a", "#c59bff"];
    for (const [sy, cnt] of [
      [3.0, 4],
      [4.1, 3],
    ] as const) {
      box(g, "#8a5a32", W - 0.6, 0.1, 0.5, { y: sy, z: -1.5 });
      for (let j = 0; j < cnt; j++) {
        const px = -W / 2 + 0.7 + ((W - 1.4) / (cnt - 1)) * j;
        ball(g, prize[(i * 2 + j + (sy > 3.5 ? 3 : 0)) % prize.length], 0.3, { x: px, y: sy + 0.32, z: -1.45, lo: true });
      }
    }
    // the crate the pumper stands on
    box(g, "#a8743f", 0.9, STEP, 0.5, { x: -0.75, y: DECK + STEP / 2, z: -0.02 });
    box(g, "#8a5a32", 0.92, 0.04, 0.52, { x: -0.75, y: DECK + STEP * 0.55, z: -0.02, cast: false });
    // the pump
    const px = -0.75,
      pz = 0.52;
    const pump = group(g, { x: px, y: DECK, z: pz });
    box(pump, "#5a5a6e", 0.9, 0.08, 0.5, { y: 0.04 });
    cyl(pump, "#d6283a", 0.19, 0.62, { y: 0.39, seg: 16 });
    cyl(pump, "#ffffff", 0.21, 0.07, { y: 0.22, seg: 16 });
    cyl(pump, "#ffffff", 0.21, 0.07, { y: 0.56, seg: 16 });
    cyl(pump, "#3a3a48", 0.12, 0.07, { y: 0.72, seg: 12 });
    const rod = group(pump, { y: 0.74 });
    cyl(rod, "#c0c4d0", 0.045, 0.5, { y: 0.0, seg: 8 });
    cyl(rod, "#2d2d38", 0.075, 0.95, { y: 0.27, rz: Math.PI / 2, seg: 10 });
    for (const sx of [-1, 1]) ball(rod, col, [0.11, 0.1, 0.1], { x: sx * 0.5, y: 0.27 });
    // the nozzle pole and the hose
    const nx = 0.85,
      nz = 0.45,
      ny = 1.5;
    cyl(g, "#3a3a48", 0.07, ny, { x: nx, y: ny / 2 + 0.24, z: nz, seg: 8 });
    cyl(g, "#c0c4d0", 0.1, 0.16, { x: nx, y: ny + 0.3, z: nz, seg: 10 });
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(px + 0.2, 0.45, pz), new THREE.Vector3(px + 0.6, 0.32, pz + 0.5), new THREE.Vector3(nx - 0.1, 0.4, nz + 0.4), new THREE.Vector3(nx, 0.8, nz + 0.1)]);
    const hose = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.05, 6), toon("#2d2d38"));
    g.add(hose);
    // the balloon
    const mat = new THREE.MeshToonMaterial({ color: col, emissive: "#000000" });
    const balloon = group(g, { x: nx, y: ny + 0.38, z: nz });
    const body = new THREE.Group();
    balloon.add(body);
    const bm = new THREE.Mesh(this.bGeo, mat);
    bm.castShadow = true;
    body.add(bm);
    ball(body, flat("#ffffff", 0.7), [0.16, 0.26, 0.08], { x: -0.42, y: 0.42, z: 0.8, rz: 0.5, cast: false });
    cone(body, mat, 0.16, 0.2, { y: -1.2, cast: false });
    this.st.push({ x, f: 0, popped: 0, plunger: 0, w: 0, wv: 0, tie: 0, age: 1, rod, balloon, body, mat, nozzle: new THREE.Vector3(x + nx, ny + 0.38, nz), hot: false, pumps: 0 });
  }

  // ------------------------------------------------------------ CPUs

  protected cpu(i: number, dt: number): CpuPad {
    const c = this.cpus[i];
    const lv = this.players[i].level;
    if (this.over) return {};
    // little breathers (more often for beginners)
    if (c.pause > 0) {
      c.pause -= dt;
      return {};
    }
    c.nextPause -= dt;
    if (c.nextPause <= 0) {
      c.pause = 0.25 + (1 - lv) * 0.5 * Math.random();
      c.nextPause = 2 + lv * 3 + Math.random() * 2;
    }
    return { a: this.mashing(i, c.rate) };
  }

  // ------------------------------------------------------------ the game

  protected idle(dt: number) {
    this.animDecor(dt);
    this.st.forEach((s) => this.animStand(s, dt));
    this.moveCam([0, 4.3, 15.4], [0, 2.7, 0], dt, 1.4);
  }

  protected step(dt: number) {
    const left = TIME - this.t;
    this.hud.timer(left);
    this.animDecor(dt);
    this.moveCam([0, 4.3, 15.4], [0, 2.7, 0], dt, 3);
    if (this.t > 5) this.hud.tip(null);
    if (!this.hurried && left <= 10 && !this.over) {
      this.hurried = true;
      this.hud.banner(T("10 SECONDS LEFT!", "还剩 10 秒！"), { color: "#ffd23f" });
      music.speed(1.15);
      this.sound("bell");
    }

    this.st.forEach((s, i) => {
      const a = this.avatars[i];
      const p = this.pad(i);
      s.age += dt;
      if (s.tie > 0) {
        s.tie -= dt;
        if (s.tie <= 0) {
          s.f = 0;
          s.age = 0;
          s.balloon.visible = true;
          this.sound("boing");
        }
      } else if (!this.over) {
        if (p.aDown) this.pump(i);
        // a slow leak
        s.f = Math.max(0, s.f - LEAK * dt);
      }
      // the avatar pushes the handle
      a.anim = "hold";
      a.pos.y = DECK + STEP - s.plunger * 0.12;
      a.groundY = DECK + STEP;
      this.animStand(s, dt);
      // the danger glow
      const hot = s.f > 0.78 && s.tie <= 0;
      if (hot !== s.hot) {
        s.hot = hot;
        this.hud.mark(this.players[i].seat, "hot", hot);
      }
    });

    // who leads (for a little crown flourish in the HUD)
    let best = -1,
      bs = -1;
    this.st.forEach((s, i) => {
      const sc = s.popped + s.f;
      if (sc > bs + 1e-6) {
        bs = sc;
        best = i;
      }
    });
    if (best !== this.leader && best >= 0 && this.st[best].popped > 0) this.leader = best;

    if (!this.over && (left <= 0 || this.st.some((s) => s.popped >= GOAL))) {
      this.over = true;
      this.endIn = left <= 0 ? 0.2 : 1.1;
      if (left > 0) {
        const w = this.st.findIndex((s) => s.popped >= GOAL);
        this.hud.banner(T(`${this.players[w].name} pops all 3!`, `${this.players[w].name} 吹爆了 3 个！`), { color: this.players[w].char.color });
      }
    }
    if (this.over) {
      this.endIn -= dt;
      if (this.endIn <= 0) this.finishByScore(this.st.map((s) => s.popped + Math.min(0.999, s.f)));
    }
  }

  private pump(i: number) {
    const s = this.st[i];
    s.plunger = 1;
    s.pumps++;
    const need = PUMPS[Math.min(s.popped, PUMPS.length - 1)];
    s.f += 1 / need;
    s.wv += 2.2 + s.f * 2;
    if (Math.random() < 0.5) this.fx.burst(s.nozzle, { count: 2, colors: ["#ffffff"], speed: 1.2, up: 1, gravity: -1, size: 0.08, sizeEnd: 0, life: 0.35, shape: "ball", drag: 3 });
    if (!this.players[i].cpu) {
      sfx.note(-14 + s.f * 26, 0.07, "sine", 0.07);
      this.sound("squeak");
    }
    if (s.f >= 1) this.pop(i);
  }

  private pop(i: number) {
    const s = this.st[i];
    const p = this.players[i];
    s.popped++;
    s.f = 0;
    s.tie = s.popped >= GOAL ? 99 : 0.55;
    s.balloon.visible = false;
    const at = s.nozzle.clone().add(new THREE.Vector3(0, 1.15 * RMAX + 0.1, 0));
    this.fx.confetti(at, 70);
    this.fx.burst(at, { count: 22, colors: [p.char.color], speed: 9, up: 2, gravity: 10, size: 0.22, sizeEnd: 0.1, life: 0.9, shape: "flake", drag: 1.5 });
    this.fx.ring(new THREE.Vector3(at.x, 0.3, at.z + 0.6), p.char.color, 2.8, 0.5);
    this.hud.pop(at.clone().add(new THREE.Vector3(0, 0.6, 0)), T("POP!", "砰！"), p.char.color, this.camera);
    this.sound("pop");
    this.sound("shoot");
    if (s.popped >= GOAL) this.sound("fanfare");
    else this.sound("coin");
    this.shake = 0.3;
    this.buzz(i, [70, 30, 70]);
    this.avatars[i].flash();
    const el = this.cardVals[i];
    if (el) this.hud.setScore(p.seat, this.balloonsHtml(s.popped));
    if (s.popped === GOAL - 1) this.hud.banner(T(`${p.name}: one to go!`, `${p.name}：还差一个！`), { color: p.char.color, ms: 900, size: 5.5 });
  }

  private animStand(s: Stand, dt: number) {
    s.plunger = damp(s.plunger, 0, 14, dt);
    s.rod.position.y = 0.74 - s.plunger * 0.3;
    // wobble: a damped spring kicked by each pump
    const k = 170,
      c = 9;
    s.wv += (-k * s.w - c * s.wv) * dt;
    s.w += s.wv * dt;
    const R = RMIN + (RMAX - RMIN) * Math.pow(s.f, 0.8);
    const pin = s.age < 0.5 ? easeOutBack(clamp(s.age / 0.5, 0, 1)) : 1;
    const wob = clamp(s.w * 0.03, -0.12, 0.12);
    const tremble = s.f > 0.75 ? (s.f - 0.75) * 0.25 : 0;
    const jx = tremble ? (Math.random() - 0.5) * tremble : 0;
    const jz = tremble ? (Math.random() - 0.5) * tremble : 0;
    s.body.scale.set(R * pin * (1 - wob * 0.6), R * pin * (1 + wob), R * pin * (1 - wob * 0.6));
    s.body.position.set(jx, 1.15 * R * pin + 0.05, jz);
    s.body.rotation.z = Math.sin(this.t * 2 + s.x) * 0.06 + jx * 0.5;
    // flashes as it nears the pop
    const glow = s.f > 0.75 ? (0.5 + 0.5 * Math.sin(this.t * (10 + s.f * 20))) * (s.f - 0.75) * 2.4 : 0;
    s.mat.emissive.setRGB(glow * 0.6, glow * 0.6, glow * 0.6);
  }

  private animDecor(dt: number) {
    this.wheel.rotation.z += dt * 0.12;
    const wp = this.wheel.position;
    const wr = 10;
    for (const c of this.cabins) {
      const a = (c.userData.a as number) + this.wheel.rotation.z;
      c.position.set(wp.x + Math.cos(a) * wr, wp.y + Math.sin(a) * wr, wp.z);
    }
    // chasing lights
    this.decoT += dt;
    const ph = Math.floor(this.decoT * 6);
    this.bulbMats.forEach((m, k) => {
      const on = (k + ph) % this.bulbMats.length !== 0;
      m.color.set(["#ff4b3e", "#ffd23f", "#3fcf5a", "#2f8dff", "#ff7ad9"][k]);
      if (!on) m.color.multiplyScalar(0.35);
    });
  }

  protected celebrate(res: { place: number[] }) {
    super.celebrate(res);
    this.avatars.forEach((a) => (a.pos.y = DECK + STEP));
  }

  protected outroStep(dt: number) {
    this.animDecor(dt);
    this.st.forEach((s) => this.animStand(s, dt));
  }

  dispose() {
    super.dispose();
    this.bGeo.dispose();
    for (const m of this.bulbMats) m.dispose();
  }
}

/** A mesh with its own geometry/material (not shared), placed. */
function mesh2(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, p: { x?: number; y?: number; z?: number } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(p.x ?? 0, p.y ?? 0, p.z ?? 0);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}

const def: MiniDef = {
  id: "gonfle-ballon",
  name: "Balloon Pump",
  icon: "🎈",
  color: "#ff5a6e",
  tagline: "Pump like mad to pop three balloons.",
  rules: "Mash A to pump your balloon until it pops. First to pop 3 wins! Careful: it goes down if you stop.",
  controls: { a: "Pump", mash: true },
  modes: ["ffa"],
  length: 25,
  music: "mini2",
  create: (ctx) => new GonfleBallon(ctx),
};
export default def;
