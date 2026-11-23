/**
 * CHAISES MUSICALES (chacun pour soi): a garden party on a round dance floor. A gramophone plays
 * while everyone walks around the ring of chairs (one chair fewer than players). When the music
 * stops: run to a free chair and press A to sit! Pressing A while the music plays = a stumble.
 * Whoever is left standing is out and a chair goes away. Three rounds, one winner.
 */
import * as THREE from "three";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef } from "../types";
import { ball, box, canvasTex, cone, cyl, group, toon, tree } from "../../engine/gfx";
import { angDiff, clamp, damp, easeInOutCubic } from "../../engine/util";
import { music } from "../../engine/audio";
import { T } from "../../../../i18n/lang";

const CR = 2.05; // chairs' radius
const WR = 4.5; // the walking ring
const SEAT_Y = 0.5;
const PR = 0.4;
const RUN = 6.2;
const WALK = 2.5;
const SIT_RANGE = 1.05;
const STUMBLE = 1.0;
const SONG = "paris" as const;

type Phase = "ready" | "music" | "stop" | "result" | "reset" | "over";

interface Chair {
  g: THREE.Group;
  ang: number;
  from: number;
  to: number;
  taken: number;
  gone: boolean;
  goneT: number;
}

interface Guest {
  x: number;
  z: number;
  vx: number;
  vz: number;
  ang: number;
  out: boolean;
  seat: number;
  stumble: number;
  /** Walking back to the ring after a round, or to the picnic blanket once out. */
  home: THREE.Vector2 | null;
  benched: boolean;
}

interface Brain {
  react: number;
  chair: number;
  pace: number;
  paceT: number;
}

class ChaisesMusicales extends BaseMini {
  private chairs: Chair[] = [];
  private gs: Guest[] = [];
  private brains: Brain[] = [];
  private phase: Phase = "ready";
  private phaseT = 0;
  private musicLen = 5;
  private round = 1;
  private outOrder: number[] = [];
  private disc!: THREE.Mesh;
  private horn!: THREE.Group;
  private notes: { s: THREE.Sprite; m: THREE.SpriteMaterial; t: number; x: number; z: number; live: boolean }[] = [];
  private noteT = 0;
  private bulbs!: THREE.InstancedMesh;
  private bulbBase: THREE.Color[] = [];
  private red = new THREE.Color("#ff3b3b");
  private pill!: HTMLElement;
  private ownTex: THREE.Texture[] = [];
  private blanketSpots = [
    [-7.4, -2.6],
    [-6.4, -3.4],
    [-7.6, -3.9],
  ];

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#6aa8ff", "#ffe0b0"], size: 12, sun: [-0.6, 0.9, 0.5], sunColor: "#ffe2b8", sunIntensity: 2.5, fog: { color: "#ffe6c8", near: 40, far: 110 } });
    this.buildGarden();
    const n = this.players.length;
    for (let k = 0; k < n - 1; k++) this.chairs.push(this.makeChair(k, n - 1));
    this.players.forEach((p, i) => {
      const ang = (i / n) * Math.PI * 2 + Math.PI / n;
      const x = Math.cos(ang) * WR,
        z = Math.sin(ang) * WR;
      const a = this.spawn(i, x, z, 0);
      a.setRing(p.char.color);
      this.gs.push({ x, z, vx: 0, vz: 0, ang, out: false, seat: -1, stumble: 0, home: null, benched: false });
      this.brains.push({ react: 0.4, chair: -1, pace: 0, paceT: 0 });
    });
    this.hud.players(this.players, () => T("In play", "在场"));
    this.pill = this.hud.add(
      `<div class="cm-pill" style="position:absolute;left:50%;top:calc(var(--u)*1);transform:translateX(-50%);padding:calc(var(--u)*0.5) calc(var(--u)*2.4);border-radius:999px;font-family:var(--title);font-size:calc(var(--u)*3);color:#fff;background:#3fae5a;border:calc(var(--u)*0.35) solid #1d1630;box-shadow:0 calc(var(--u)*0.45) 0 rgba(0,0,0,0.3);white-space:nowrap;transition:background 0.15s">${T("Round 1", "第 1 回合")}</div>`,
    ).firstElementChild as HTMLElement;
    this.setCam([0, 22, 24], [0, 0, 0], 40);
  }

  // ------------------------------------------------------------ the garden

  private buildGarden() {
    const s = this.scene;
    const lawnTex = canvasTex(
      256,
      256,
      (g, w) => {
        for (let k = 0; k < 8; k++) {
          g.fillStyle = k % 2 ? "#86cc5e" : "#7cc256";
          g.fillRect(0, (k * w) / 8, w, w / 8);
        }
      },
      true,
    );
    lawnTex.repeat.set(10, 10);
    this.ownTex.push(lawnTex);
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), new THREE.MeshToonMaterial({ map: lawnTex }));
    lawn.rotation.x = -Math.PI / 2;
    lawn.receiveShadow = true;
    s.add(lawn);
    // the round parquet dance floor
    const floorTex = canvasTex(1024, 1024, (g, w) => {
      g.fillStyle = "#b9824e";
      g.fillRect(0, 0, w, w);
      const cols = ["#c8925a", "#b07a46", "#d29c62", "#bd8650"];
      for (let y = 0; y < w; y += 64)
        for (let x = -((y / 64) % 2) * 64; x < w; x += 128) {
          g.fillStyle = cols[((x + y * 3) / 64) & 3];
          g.fillRect(x + 2, y + 2, 124, 60);
        }
      const c = w / 2;
      g.strokeStyle = "#fff3dc";
      g.lineWidth = 14;
      g.beginPath();
      g.arc(c, c, c * 0.88, 0, Math.PI * 2);
      g.stroke();
      g.lineWidth = 6;
      g.setLineDash([24, 18]);
      g.beginPath();
      g.arc(c, c, c * (WR / 5.6), 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
    });
    this.ownTex.push(floorTex);
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 5.75, 0.16, 64), [toon("#8a5a32"), new THREE.MeshToonMaterial({ map: floorTex }), toon("#8a5a32")]);
    floor.position.y = 0.08;
    floor.receiveShadow = true;
    s.add(floor);
    // the gramophone on its pedestal table
    const ped = group(s);
    cyl(ped, "#fff3dc", 0.55, 0.06, { y: 0.84, seg: 24 });
    cyl(ped, "#fff3dc", 0.08, 0.84, { y: 0.42, seg: 10 });
    cyl(ped, "#fff3dc", 0.35, 0.06, { y: 0.03, seg: 16 });
    box(ped, "#7a4a2a", 0.7, 0.36, 0.7, { y: 1.05 });
    box(ped, "#c9a040", 0.74, 0.05, 0.74, { y: 0.88 });
    this.disc = cyl(ped, "#1d1630", 0.3, 0.03, { y: 1.25, seg: 24 });
    cyl(ped, "#ff5a6a", 0.08, 0.035, { y: 1.265, seg: 12 });
    this.horn = group(ped, { y: 1.3, x: 0.15 });
    cyl(this.horn, "#c9a040", 0.05, 0.5, { y: 0.25, rz: -0.25, seg: 8 });
    const hornGeo = new THREE.ConeGeometry(0.55, 0.9, 24, 1, true);
    hornGeo.translate(0, -0.45, 0);
    const hornMesh = new THREE.Mesh(hornGeo, (() => {
      const m = toon("#e8b84a", "#7a5200", 0.25).clone();
      m.side = THREE.DoubleSide;
      return m;
    })());
    hornMesh.position.set(0.25, 0.95, 0.1);
    hornMesh.rotation.set(0.5, 0, -0.9);
    hornMesh.castShadow = true;
    this.horn.add(hornMesh);
    // music notes floating out of the horn
    const noteTex = canvasTex(64, 64, (g) => {
      g.fillStyle = "#1d1630";
      g.strokeStyle = "#1d1630";
      g.beginPath();
      g.ellipse(22, 48, 11, 8, -0.4, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(31, 46);
      g.lineTo(31, 8);
      g.quadraticCurveTo(46, 14, 50, 28);
      g.stroke();
    });
    this.ownTex.push(noteTex);
    for (let k = 0; k < 10; k++) {
      const m = new THREE.SpriteMaterial({ map: noteTex, transparent: true, depthWrite: false, color: ["#ff5a6a", "#3fae5a", "#2f8dff", "#9b5cff"][k % 4] });
      const sp = new THREE.Sprite(m);
      sp.scale.setScalar(0.55);
      sp.visible = false;
      s.add(sp);
      this.notes.push({ s: sp, m, t: 0, x: 0, z: 0, live: false });
    }
    // lantern posts with string lights around the back half of the floor (the front stays open)
    const posts: THREE.Vector3[] = [];
    for (let k = 0; k < 6; k++) {
      const a = Math.PI * 0.92 + (k / 5) * Math.PI * 1.16;
      const x = Math.cos(a) * 7.4,
        z = Math.sin(a) * 7.4;
      cyl(s, "#3a3a4a", 0.08, 3.4, { x, y: 1.7, z, seg: 8 });
      ball(s, toon("#fff1b0", "#ffcc33", 0.8), 0.22, { x, y: 3.5, z, cast: false });
      posts.push(new THREE.Vector3(x, 3.3, z));
    }
    const per = 8;
    this.bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: "#ffffff" }), (posts.length - 1) * per);
    const cols = ["#ffe14a", "#ff9ad5", "#9fe0ff", "#ffffff"];
    const m4 = new THREE.Matrix4();
    let n = 0;
    for (let k = 0; k < posts.length - 1; k++) {
      const a = posts[k],
        b = posts[k + 1];
      for (let q = 1; q <= per; q++) {
        const t = q / (per + 1);
        const p = a.clone().lerp(b, t);
        p.y -= Math.sin(t * Math.PI) * 0.7;
        m4.makeScale(0.1, 0.1, 0.1).setPosition(p);
        this.bulbs.setMatrixAt(n, m4);
        const c = new THREE.Color(cols[n % cols.length]);
        this.bulbBase.push(c);
        this.bulbs.setColorAt(n, c);
        n++;
      }
    }
    s.add(this.bulbs);
    // hedges and flowers around
    for (let k = 0; k < 22; k++) {
      const a = (k / 22) * Math.PI * 2;
      if (Math.abs(angDiff(a, Math.PI / 2)) < 0.35) continue; // an opening toward the camera
      const x = Math.cos(a) * 10.5,
        z = Math.sin(a) * 10.5;
      ball(s, "#3f9a4a", [1.4, 0.9, 1.0], { x, y: 0.6, z, ry: -a, lo: true });
      ball(s, ["#ff5a7a", "#ffffff", "#ffd23f", "#ff9ad5"][k % 4], 0.16, { x: x * 0.98, y: 1.35, z: z * 0.98, lo: true, cast: false });
    }
    // picnic blanket for those who lose their chair
    const bl = canvasTex(128, 128, (g, w) => {
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++) {
          g.fillStyle = (x + y) % 2 ? "#ffffff" : "#ff5a6a";
          g.fillRect((x * w) / 8, (y * w) / 8, w / 8, w / 8);
        }
    });
    this.ownTex.push(bl);
    const blanket = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.8), new THREE.MeshToonMaterial({ map: bl }));
    blanket.rotation.x = -Math.PI / 2;
    blanket.rotation.z = 0.2;
    blanket.position.set(-7.1, 0.02, -3.2);
    blanket.receiveShadow = true;
    s.add(blanket);
    box(s, "#c98a52", 0.7, 0.4, 0.5, { x: -8.4, y: 0.2, z: -2.2 });
    // buffet tables with cakes
    for (const [x, z] of [
      [7.6, -3.2],
      [-2.2, -8.6],
    ]) {
      const g = group(s, { x, z });
      box(g, "#ffffff", 2.6, 0.12, 1.2, { y: 0.9 });
      box(g, "#f4f0ff", 2.7, 0.5, 1.3, { y: 0.66, cast: false });
      for (const lx of [-1.1, 1.1]) for (const lz of [-0.45, 0.45]) cyl(g, "#ffffff", 0.05, 0.9, { x: lx, y: 0.45, z: lz, seg: 6 });
      cyl(g, "#ffd8e8", 0.38, 0.3, { x: -0.5, y: 1.12, seg: 20 });
      cyl(g, "#fff3dc", 0.27, 0.26, { x: -0.5, y: 1.4, seg: 20 });
      cyl(g, "#ffd8e8", 0.17, 0.22, { x: -0.5, y: 1.63, seg: 16 });
      ball(g, "#ff3b3b", 0.07, { x: -0.5, y: 1.8, cast: false });
      for (let q = 0; q < 3; q++) cyl(g, "#c8f0ff", 0.08, 0.22, { x: 0.3 + q * 0.3, y: 1.07, z: 0.15, seg: 8 });
    }
    // the manor and the trees
    const manor = group(s, { z: -24 });
    box(manor, "#f4e8d0", 30, 9, 5, { y: 4.5 });
    box(manor, "#5a6a8a", 31, 2.4, 5.6, { y: 10.1 });
    cone(manor, "#5a6a8a", 3.5, 3, { x: 0, y: 12.6, lo: true });
    for (let fx = -13; fx <= 13; fx += 2.6) for (const fy of [2.5, 6.4]) box(manor, "#7a9ac8", 1.3, 2.2, 0.15, { x: fx, y: fy, z: 2.55, cast: false });
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2 + 0.2;
      if (Math.sin(a) > 0.5) continue;
      tree(s, Math.cos(a) * 16, Math.sin(a) * 15, 1.7 + (k % 3) * 0.3, k % 2 ? "#5cb04f" : "#48a04a");
    }
  }

  private makeChair(k: number, n: number): Chair {
    const g = group(this.scene);
    const wood = "#ffffff";
    const cushion = ["#ff7a9a", "#7ac8ff", "#ffd23f"][k % 3];
    box(g, wood, 0.86, 0.1, 0.8, { y: SEAT_Y });
    box(g, cushion, 0.74, 0.1, 0.68, { y: SEAT_Y + 0.09 });
    for (const lx of [-0.36, 0.36]) for (const lz of [-0.32, 0.32]) cyl(g, wood, 0.045, SEAT_Y, { x: lx, y: SEAT_Y / 2, z: lz, seg: 6 });
    // the back is on the inner side (−z in the chair's frame)
    for (const lx of [-0.36, 0.36]) cyl(g, wood, 0.045, 0.85, { x: lx, y: SEAT_Y + 0.45, z: -0.36, seg: 6 });
    box(g, wood, 0.86, 0.28, 0.08, { y: SEAT_Y + 0.78, z: -0.36 });
    box(g, cushion, 0.6, 0.12, 0.06, { y: SEAT_Y + 0.5, z: -0.36 });
    const ang = (k / n) * Math.PI * 2;
    const c: Chair = { g, ang, from: ang, to: ang, taken: -1, gone: false, goneT: 0 };
    this.placeChair(c);
    return c;
  }
  private placeChair(c: Chair) {
    c.g.position.set(Math.cos(c.ang) * CR, 0.16, Math.sin(c.ang) * CR);
    // the seat faces outward: local +z → outward
    c.g.rotation.y = Math.atan2(Math.cos(c.ang), Math.sin(c.ang));
  }
  /** Where you stand to sit on chair c. */
  private front(c: Chair) {
    return { x: Math.cos(c.ang) * (CR + 0.55), z: Math.sin(c.ang) * (CR + 0.55) };
  }
  private liveChairs() {
    return this.chairs.filter((c) => !c.gone);
  }

  // ------------------------------------------------------------ rounds

  start() {
    this.beginMusic();
  }

  private beginMusic() {
    this.phase = "music";
    this.phaseT = 0;
    this.musicLen = 3 + this.rnd() * 5;
    if (this.round > 1) music.play(SONG);
    this.setPill(T("Music!", "音乐！"), "#3fae5a");
    this.hud.tip(T("Circle the chairs… Don't press A while the music plays!", "绕着椅子走……音乐响时别按 A！"));
    this.brains.forEach((b) => {
      b.chair = -1;
      b.paceT = 0;
    });
  }

  private beginStop() {
    this.phase = "stop";
    this.phaseT = 0;
    music.stop(0.05);
    this.sound("slide");
    this.sound("buzzer");
    this.shake = 0.25;
    this.hud.banner(T("STOP!", "停！"), { color: "#ff3b3b", ms: 900, size: 13 });
    this.setPill(T("STOP! Sit down!", "停！快坐下！"), "#ff3b3b");
    this.hud.tip(T("Run to a free chair and press <b>A</b>!", "跑到空椅子前按 <b>A</b>！"));
    this.gs.forEach((_, i) => {
      if (!this.players[i].cpu) return;
      const lv = this.players[i].level;
      this.brains[i].react = 0.12 + (1 - lv) * 0.45 + Math.random() * 0.2;
      this.brains[i].chair = -1;
      this.cpuReset(i, "react");
      this.cpuReset(i, "sit");
    });
    this.gs.forEach((g, i) => {
      if (!g.out) this.buzz(i, 80);
    });
  }

  private resolve() {
    // every chair taken (or time's up): whoever still stands is out
    const standing = this.gs.map((g, i) => (!g.out && g.seat < 0 ? i : -1)).filter((i) => i >= 0);
    const free = this.liveChairs().filter((c) => c.taken < 0);
    // time out: the free chairs go to the nearest standing guests
    for (const c of free) {
      if (standing.length <= 1) break;
      const f = this.front(c);
      standing.sort((a, b) => Math.hypot(this.gs[a].x - f.x, this.gs[a].z - f.z) - Math.hypot(this.gs[b].x - f.x, this.gs[b].z - f.z));
      this.sit(standing.shift()!, this.chairs.indexOf(c));
    }
    const loser = standing[0] ?? -1;
    this.phase = "result";
    this.phaseT = 0;
    this.hud.tip(null);
    if (loser >= 0) {
      const g = this.gs[loser];
      g.out = true;
      this.outOrder.push(loser);
      const a = this.avatars[loser];
      a.anim = "lose";
      a.setRing(null);
      this.hud.mark(this.players[loser].seat, "out");
      this.hud.setScore(this.players[loser].seat, T("No chair", "没椅子"));
      this.hud.banner(T(`No chair for ${this.players[loser].name}!`, `${this.players[loser].name} 没抢到椅子！`), { color: "#ffd23f", ms: 1500, size: 5 });
      this.sound("aww");
      this.buzz(loser, [120, 60, 120]);
      const spot = this.blanketSpots[this.outOrder.length - 1] ?? [-7, -3];
      g.home = new THREE.Vector2(spot[0], spot[1]);
    }
    this.setPill(T(`Round ${this.round} over`, `第 ${this.round} 回合结束`), "#6a5acd");
  }

  private sit(i: number, ci: number) {
    const g = this.gs[i];
    const c = this.chairs[ci];
    if (!c || c.taken >= 0 || c.gone || g.seat >= 0) return;
    c.taken = i;
    g.seat = ci;
    g.vx = g.vz = 0;
    this.sound("pop");
    this.sound("confirm");
    this.fx.burst({ x: c.g.position.x, y: 1, z: c.g.position.z }, { count: 12, colors: [this.players[i].char.color, "#ffffff"], speed: 3, up: 2, size: 0.13 });
    this.hud.setScore(this.players[i].seat, T("Seated!", "坐下了！"));
    this.buzz(i, 40);
  }

  private beginReset() {
    this.phase = "reset";
    this.phaseT = 0;
    this.round++;
    // everyone stands up and steps back to the ring; one chair goes away
    this.gs.forEach((g, i) => {
      if (g.out) return;
      g.seat = -1;
      const a = Math.atan2(g.z, g.x);
      g.home = new THREE.Vector2(Math.cos(a) * WR, Math.sin(a) * WR);
      this.hud.setScore(this.players[i].seat, T("In play", "在场"));
    });
    const live = this.liveChairs();
    const rm = live[Math.floor(this.rnd() * live.length)];
    rm.gone = true;
    rm.goneT = 0;
    this.sound("whoosh");
    this.fx.burst({ x: rm.g.position.x, y: 0.8, z: rm.g.position.z }, { count: 18, colors: ["#ffffff", "#ffe8f0"], speed: 3.5, up: 2, size: 0.25, shape: "ball", life: 0.7 });
    const rest = this.liveChairs();
    // the chairs spread out evenly again (keeping their order)
    rest.sort((a, b) => a.ang - b.ang);
    const base = rest[0]?.ang ?? 0;
    rest.forEach((c, k) => {
      c.taken = -1;
      c.from = c.ang;
      c.to = base + (k / rest.length) * Math.PI * 2;
    });
    this.setPill(T(`Round ${this.round}`, `第 ${this.round} 回合`), "#3fae5a");
    this.hud.banner(rest.length === 1 ? T("THE FINAL!", "决赛！") : T(`ROUND ${this.round}`, `第 ${this.round} 回合`), { color: "#ffffff", ms: 1100, sub: T(`${rest.length} chair${rest.length === 1 ? "" : "s"} for ${rest.length + 1}`, `${rest.length + 1} 个人抢 ${rest.length} 把椅子`) });
  }

  private setPill(text: string, bg: string) {
    this.pill.textContent = text;
    this.pill.style.background = bg;
  }

  // ------------------------------------------------------------ CPUs

  protected cpu(i: number, dt: number): CpuPad {
    const me = this.gs[i];
    if (me.out || me.seat >= 0) return {};
    const lv = this.players[i].level;
    const b = this.brains[i];
    if (this.phase === "music") {
      // good players slow down near a chair and hurry between them
      b.paceT -= dt;
      if (b.paceT <= 0) {
        b.paceT = 0.25 + (1 - lv) * 0.6;
        let near = Infinity;
        for (const c of this.liveChairs()) near = Math.min(near, Math.abs(angDiff(me.ang, c.ang)));
        const gap = Math.PI / this.liveChairs().length;
        const smart = near < gap * 0.45 ? -1 : 1;
        b.pace = Math.random() < lv ? smart : Math.random() * 2 - 1;
      }
      // the walking direction is clockwise seen from above (decreasing angle)
      const tx = Math.sin(me.ang),
        tz = -Math.cos(me.ang);
      // a careless one sometimes presses A too early
      const oops = Math.random() < dt * (1 - lv) * 0.05;
      return { x: tx * b.pace, y: tz * b.pace, a: oops };
    }
    if (this.phase === "stop") {
      if (!this.cpuAfter(i, "react", b.react)) return {};
      const live = this.liveChairs();
      let c = b.chair >= 0 ? this.chairs[b.chair] : null;
      if (!c || c.taken >= 0 || c.gone) {
        // pick the free chair we reach first (the clever ones think about the others)
        let best = -1,
          bestS = Infinity;
        for (const ch of live) {
          if (ch.taken >= 0) continue;
          const f = this.front(ch);
          const d = Math.hypot(f.x - me.x, f.z - me.z);
          let rival = Infinity;
          this.gs.forEach((o, j) => {
            if (j !== i && !o.out && o.seat < 0) rival = Math.min(rival, Math.hypot(f.x - o.x, f.z - o.z));
          });
          const s = d - lv * 0.6 * Math.min(rival, 4) + (Math.random() - 0.5) * (1 - lv);
          if (s < bestS) {
            bestS = s;
            best = this.chairs.indexOf(ch);
          }
        }
        b.chair = best;
        this.cpuReset(i, "sit");
        c = best >= 0 ? this.chairs[best] : null;
      }
      if (!c) return {};
      const f = this.front(c);
      const dx = f.x - me.x,
        dz = f.z - me.z;
      const d = Math.hypot(dx, dz);
      const out: CpuPad = d > 0.15 ? { x: dx / d, y: dz / d } : {};
      if (d < SIT_RANGE * 0.9 && this.cpuAfter(i, "sit", 0.03 + (1 - lv) * 0.18)) out.a = true;
      return out;
    }
    return {};
  }

  // ------------------------------------------------------------ frame

  protected idle(dt: number) {
    this.animGarden(dt, false);
    for (const c of this.chairs) this.placeChair(c);
    this.gs.forEach((g, i) => {
      this.avatars[i].faceTo(0, 0, dt, 4);
      this.avatars[i].pos.set(g.x, 0.16, g.z);
    });
    this.moveCam([0, 11.5, 12.2], [0, 0.2, 0.6], dt, 1.5);
  }

  protected step(dt: number) {
    this.phaseT += dt;
    this.moveCam([0, 11.5, 12.2], [0, 0.2, 0.6], dt, 3);
    const playing = this.phase === "music";
    this.animGarden(dt, playing);

    if (this.phase === "music" && this.phaseT >= this.musicLen) this.beginStop();
    else if (this.phase === "stop") {
      const free = this.liveChairs().filter((c) => c.taken < 0).length;
      if (free === 0 || this.phaseT > 6) this.resolve();
    } else if (this.phase === "result" && this.phaseT > 2.2) {
      if (this.gs.filter((g) => !g.out).length <= 1) {
        this.phase = "over";
        const winner = this.gs.findIndex((g) => !g.out);
        if (winner >= 0) this.hud.mark(this.players[winner].seat, "win");
        this.finishByElimination(this.outOrder);
        return;
      }
      this.beginReset();
    } else if (this.phase === "reset") {
      const p = clamp(this.phaseT / 1.0, 0, 1);
      for (const c of this.chairs) {
        if (c.gone) continue;
        c.ang = c.from + angDiff(c.from, c.to) * easeInOutCubic(p);
        this.placeChair(c);
      }
      if (this.phaseT > 1.9) this.beginMusic();
    }
    // the removed chair flies off
    for (const c of this.chairs) {
      if (!c.gone || !c.g.visible) continue;
      c.goneT += dt;
      c.g.position.y += dt * 6 * c.goneT * 3;
      c.g.rotation.z += dt * 5;
      c.g.scale.setScalar(Math.max(0.01, 1 - c.goneT * 1.2));
      if (c.goneT > 0.85) c.g.visible = false;
    }
    this.stepGuests(dt);
  }

  private stepGuests(dt: number) {
    this.gs.forEach((g, i) => {
      const a = this.avatars[i];
      const p = this.pad(i);
      // seated: stay put on the chair
      if (g.seat >= 0) {
        const c = this.chairs[g.seat];
        g.x = c.g.position.x;
        g.z = c.g.position.z;
        a.pos.set(g.x, 0.16 + SEAT_Y + 0.08, g.z);
        a.yaw = c.g.rotation.y;
        a.anim = "sit";
        return;
      }
      // walking somewhere by itself (back to the ring, or to the blanket)
      if (g.home) {
        const dx = g.home.x - g.x,
          dz = g.home.y - g.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.1) {
          const sp = Math.min(d, (g.out ? 3 : 4.5) * dt);
          g.x += (dx / d) * sp;
          g.z += (dz / d) * sp;
          a.face(Math.atan2(dx, dz), dt);
          a.anim = g.out && this.phase === "result" && this.phaseT < 0.9 ? "lose" : "run";
          a.speed = 0.6;
        } else {
          g.home = null;
          if (g.out) g.benched = true;
          g.ang = Math.atan2(g.z, g.x);
        }
        if (g.out && this.phaseT < 0.9 && this.phase === "result") {
          // sulks a moment before leaving
          g.x -= (dx / (d || 1)) * Math.min(d, 3 * dt);
          g.z -= (dz / (d || 1)) * Math.min(d, 3 * dt);
        }
        a.pos.set(g.x, this.onFloor(g.x, g.z), g.z);
        return;
      }
      if (g.out) {
        if (g.benched) {
          a.anim = "sit";
          a.faceTo(0, 0, dt, 4);
          a.pos.set(g.x, 0.02, g.z);
        }
        return;
      }
      if (g.stumble > 0) {
        g.stumble -= dt;
        g.vx *= Math.exp(-8 * dt);
        g.vz *= Math.exp(-8 * dt);
        a.anim = "stun";
      }
      if (this.phase === "music") {
        if (p.aDown && g.stumble <= 0) {
          g.stumble = STUMBLE;
          this.sound("bonk");
          this.sound("wrong");
          a.flash();
          this.hud.pop(new THREE.Vector3(g.x, 2.2, g.z), T("OOPS!", "哎呀！"), "#ff7a5a", this.camera);
          this.buzz(i, [60, 30, 60]);
        }
        if (g.stumble <= 0) {
          // around the ring, clockwise; the stick only speeds up / slows down
          const tx = Math.sin(g.ang),
            tz = -Math.cos(g.ang);
          const push = p.x * tx + p.y * tz;
          const sp = clamp(WALK + push * 1.4, 1.0, 3.9);
          g.ang -= (sp / WR) * dt;
          const wx = Math.cos(g.ang) * WR,
            wz = Math.sin(g.ang) * WR;
          g.vx = (wx - g.x) / Math.max(dt, 1e-3);
          g.vz = (wz - g.z) / Math.max(dt, 1e-3);
          g.x = damp(g.x, wx, 12, dt);
          g.z = damp(g.z, wz, 12, dt);
          a.face(Math.atan2(tx, tz), dt);
          a.anim = "run";
          a.speed = clamp(sp / 5, 0.25, 0.8);
        }
      } else if (this.phase === "stop") {
        if (g.stumble <= 0) {
          const k = 1 - Math.exp(-14 * dt);
          g.vx += (p.x * RUN - g.vx) * k;
          g.vz += (p.y * RUN - g.vz) * k;
          const v = Math.hypot(g.vx, g.vz);
          if (v > 0.4) a.face(Math.atan2(g.vx, g.vz), dt);
          a.anim = v > 0.5 ? "run" : "idle";
          a.speed = clamp(v / RUN, 0, 1);
          if (p.aDown) {
            // the nearest free chair in reach
            let best = -1,
              bd = SIT_RANGE;
            this.chairs.forEach((c, ci) => {
              if (c.gone || c.taken >= 0) return;
              const f = this.front(c);
              const d = Math.min(Math.hypot(f.x - g.x, f.z - g.z), Math.hypot(c.g.position.x - g.x, c.g.position.z - g.z) + 0.15);
              if (d < bd) {
                bd = d;
                best = ci;
              }
            });
            if (best >= 0) this.sit(i, best);
            else this.sound("select");
          }
        }
        g.x += g.vx * dt;
        g.z += g.vz * dt;
        g.ang = Math.atan2(g.z, g.x);
      } else {
        a.anim = "idle";
        a.faceTo(0, 0, dt, 4);
      }
      // keep off the gramophone and the chairs, and on the dance floor
      const r = Math.hypot(g.x, g.z);
      if (r < 0.95) {
        g.x *= 0.95 / (r || 1);
        g.z *= 0.95 / (r || 1);
      }
      if (r > 5.3) {
        g.x *= 5.3 / r;
        g.z *= 5.3 / r;
      }
      for (const c of this.chairs) {
        if (c.gone) continue;
        const dx = g.x - c.g.position.x,
          dz = g.z - c.g.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.62 && d > 1e-4) {
          g.x = c.g.position.x + (dx / d) * 0.62;
          g.z = c.g.position.z + (dz / d) * 0.62;
        }
      }
      a.pos.set(g.x, 0.16, g.z);
    });
    // bumps between the standing guests
    for (let i = 0; i < this.gs.length; i++)
      for (let j = i + 1; j < this.gs.length; j++) {
        const A = this.gs[i],
          B = this.gs[j];
        if (A.out || B.out || A.home || B.home) continue;
        const dx = B.x - A.x,
          dz = B.z - A.z;
        const d = Math.hypot(dx, dz);
        if (d < PR * 2 && d > 1e-4) {
          const push = PR * 2 - d;
          const wa = A.seat >= 0 ? 0 : B.seat >= 0 ? 1 : 0.5;
          A.x -= (dx / d) * push * wa;
          A.z -= (dz / d) * push * wa;
          B.x += (dx / d) * push * (1 - wa);
          B.z += (dz / d) * push * (1 - wa);
        }
      }
  }

  private onFloor(x: number, z: number) {
    return Math.hypot(x, z) < 5.6 ? 0.16 : 0.02;
  }

  private animGarden(dt: number, playing: boolean) {
    this.clock += dt;
    if (playing) {
      this.disc.rotation.y += dt * 5;
      const beat = Math.abs(Math.sin(this.clock * 4.4));
      this.horn.scale.set(1 + beat * 0.05, 1 - beat * 0.04, 1 + beat * 0.05);
      this.noteT -= dt;
      if (this.noteT <= 0) {
        this.noteT = 0.32;
        const n = this.notes.find((q) => !q.live);
        if (n) {
          n.live = true;
          n.t = 0;
          n.x = 0.4 + (Math.random() - 0.5) * 0.3;
          n.z = 0.3 + (Math.random() - 0.5) * 0.3;
          n.s.visible = true;
        }
      }
    } else this.horn.scale.set(1, 1, 1);
    for (const n of this.notes) {
      if (!n.live) continue;
      n.t += dt;
      const k = n.t / 2.2;
      n.s.position.set(n.x + Math.sin(n.t * 3 + n.z * 9) * 0.35 + n.t * 0.3, 2.3 + n.t * 1.1, n.z + n.t * 0.25);
      n.m.opacity = 1 - k;
      n.s.scale.setScalar(0.45 + Math.sin(n.t * 6) * 0.05);
      if (k >= 1) {
        n.live = false;
        n.s.visible = false;
      }
    }
    // string lights: twinkle with the music, flash red when it stops
    const stop = this.phase === "stop";
    const ph = Math.floor(this.clock * 6);
    for (let k = 0; k < this.bulbBase.length; k++) {
      const c = stop ? (Math.floor(this.clock * 8) % 2 ? this.red : this.bulbBase[3]) : (k + ph) % 5 === 0 ? this.bulbBase[3] : this.bulbBase[k];
      this.bulbs.setColorAt(k, c);
    }
    if (this.bulbs.instanceColor) this.bulbs.instanceColor.needsUpdate = true;
  }
  private clock = 0;

  protected outroStep(dt: number) {
    this.animGarden(dt, false);
    this.stepGuests(dt);
    const w = this.gs.findIndex((g) => !g.out);
    if (w >= 0) {
      const g = this.gs[w];
      this.moveCam([g.x * 0.6, 5.2, g.z + 7.5], [g.x, 1.7, g.z], dt, 1.8);
      if (Math.random() < dt * 1.5) this.fx.confetti({ x: g.x, y: 2.8, z: g.z }, 16);
    }
  }

  dispose() {
    super.dispose();
    for (const t of this.ownTex) t.dispose();
    for (const n of this.notes) n.m.dispose();
  }
}

const def: MiniDef = {
  id: "chaises-musicales",
  name: "Musical Chairs",
  icon: "🪑",
  color: "#ffcf5a",
  tagline: "When the music stops, sit down fast!",
  rules: "Circle the chairs while the music plays. When it stops, run to a free chair and press A! Press during the music and you trip. Whoever is left standing is out.",
  controls: { stick: "Speed up / run", a: "Sit" },
  modes: ["ffa"],
  length: 40,
  music: SONG,
  create: (ctx) => new ChaisesMusicales(ctx),
};
export default def;
