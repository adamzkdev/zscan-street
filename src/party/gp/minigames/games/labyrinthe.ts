/**
 * LABYRINTHE (chacun pour soi, 60 s max): a French-garden hedge maze seen from above. Each player
 * starts in a corner; the exit, a golden pavilion with a star, is in the centre. The maze is carved
 * by a seeded DFS and repeated by quarter-turns, so every corner has exactly the same way in.
 * « Trèfles turbo » give a burst of speed. First to the star wins; then by arrival; at 60 s the
 * others are ranked by their distance (along the paths) to the centre.
 */
import * as THREE from "three";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef } from "../types";
import { ball, box, canvasTex, coinMesh, cone, cyl, flat, group, toon, tree } from "../../engine/gfx";
import { clamp } from "../../engine/util";
import { music } from "../../engine/audio";
import { T } from "../../../../i18n/lang";

const N = 15;
const C = 7;
const CELL = 1.3;
const WALL_T = 0.3;
const WALL_H = 0.95;
const TIME = 60;
const SPEED = 3.9;
const TURBO = 1.75;
const TURBO_T = 3;
const CLOVER_RESPAWN = 9;
const AV_SCALE = 0.8;
/** 0 up (-z), 1 right (+x), 2 down (+z), 3 left (-x). */
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];
const opp = (d: number) => (d + 2) % 4;
const placeTxt = (n: number) => T(["1st", "2nd", "3rd", "4th"][n - 1] ?? `${n}th`, `第 ${n} 名`);

interface Runner {
  cx: number;
  cy: number;
  nx: number;
  ny: number;
  t: number;
  dir: number;
  boost: number;
  done: boolean;
  place: number;
  /** CPU: decision for the cell it is about to reach. */
  planFor: number;
  planDir: number;
  pause: number;
  wander: number;
  target: number;
  label: HTMLElement | null;
}
interface Clover {
  cell: number;
  g: THREE.Group;
  respawn: number;
}

class Labyrinthe extends BaseMini {
  /** open[cell][dir] */
  private open: boolean[][] = [];
  private distC: number[] = [];
  private run: Runner[] = [];
  private clovers: Clover[] = [];
  private arrived = 0;
  /** The golden ⓩ spinning over the pavilion (the goal). */
  private star!: THREE.Group;
  private glow!: THREE.Mesh;
  private hurried = false;
  private ended = false;
  private distCache = new Map<number, number[]>();

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#6cb8ff", "#e8f6ff"], size: 14, sun: [0.35, 1, 0.5], fog: { near: 50, far: 120 } });
    this.carve();
    this.distC = this.bfs(this.id(C, C));
    this.buildGarden();
    this.buildMaze();
    this.buildPavilion();
    this.placeClovers();
    const corners = [
      [0, 0],
      [N - 1, 0],
      [0, N - 1],
      [N - 1, N - 1],
    ];
    this.players.forEach((p, i) => {
      const [cx, cy] = corners[i];
      const [x, z] = this.w(cx, cy);
      const pad = new THREE.Mesh(new THREE.CircleGeometry(0.62, 28), flat(p.char.color, 0.7));
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(x, 0.03, z);
      this.scene.add(pad);
      const a = this.spawn(i, x, z, Math.atan2(-x, -z), { scale: AV_SCALE });
      a.setRing(p.char.color);
      const label = this.hud.label(a.root, `<div class="lb-tag" style="--pc:${p.char.color}">${p.name}</div>`, { dy: 1.5, cls: "lb-wrap" });
      this.run.push({ cx, cy, nx: cx, ny: cy, t: 0, dir: -1, boost: 0, done: false, place: 0, planFor: -1, planDir: -1, pause: 0, wander: 0, target: this.id(C, C), label });
    });
    this.hud.add(
      `<style>
      .lb-wrap{background:transparent!important;padding:0!important}
      .lb-tag{position:relative;font-family:var(--title);font-size:calc(var(--u)*1.35);color:#fff;background:var(--pc);border:calc(var(--u)*.22) solid #1d1630;border-radius:999px;padding:0 calc(var(--u)*.7);margin-bottom:calc(var(--u)*.9);text-shadow:0 1px 0 rgba(0,0,0,.4)}
      .lb-tag:after{content:"";position:absolute;left:50%;bottom:calc(var(--u)*-1.05);margin-left:calc(var(--u)*-.7);border-left:calc(var(--u)*.7) solid transparent;border-right:calc(var(--u)*.7) solid transparent;border-top:calc(var(--u)*.85) solid #1d1630}
      .lb-tag.small{font-size:0;padding:0;width:calc(var(--u)*1.9);height:calc(var(--u)*1.9);border-radius:50%}
      .lb-tag.turbo{box-shadow:0 0 calc(var(--u)*1.2) #7dff8a}
      </style>`,
    );
    this.hud.players(this.players, () => T("On the way", "前进中"));
    this.hud.timer(TIME);
    this.setCam([0, 34, 26], [0, 0, 0.6], 44);
  }

  // ------------------------------------------------------------ the maze

  private id(x: number, y: number) {
    return y * N + x;
  }
  private xy(c: number): [number, number] {
    return [c % N, Math.floor(c / N)];
  }
  /** World x, z of a cell's centre. */
  private w(x: number, y: number): [number, number] {
    return [(x - C) * CELL, (y - C) * CELL];
  }
  private rot(x: number, y: number): [number, number] {
    return [N - 1 - y, x];
  }
  private setOpen(x: number, y: number, d: number) {
    // carve an edge and its three quarter-turn images
    let ax = x,
      ay = y,
      dd = d;
    for (let k = 0; k < 4; k++) {
      const bx = ax + DX[dd],
        by = ay + DY[dd];
      if (bx >= 0 && by >= 0 && bx < N && by < N) {
        this.open[this.id(ax, ay)][dd] = true;
        this.open[this.id(bx, by)][opp(dd)] = true;
      }
      [ax, ay] = this.rot(ax, ay);
      dd = (dd + 1) % 4;
    }
  }
  private inQ0(x: number, y: number) {
    return x >= 0 && x <= C && y >= 0 && y <= C - 1;
  }

  private carve() {
    // several seeded tries; keep the one whose way in has a good length
    let best: boolean[][] | null = null;
    let bestScore = -1e9;
    for (let attempt = 0; attempt < 16; attempt++) {
      this.open = Array.from({ length: N * N }, () => [false, false, false, false]);
      const seen = new Set<number>([this.id(0, 0)]);
      const stack: [number, number][] = [[0, 0]];
      while (stack.length) {
        const [x, y] = stack[stack.length - 1];
        const dirs = [0, 1, 2, 3].filter((d) => {
          const nx = x + DX[d],
            ny = y + DY[d];
          return this.inQ0(nx, ny) && !seen.has(this.id(nx, ny));
        });
        if (!dirs.length) {
          stack.pop();
          continue;
        }
        const d = dirs[Math.floor(this.rnd() * dirs.length)];
        this.setOpen(x, y, d);
        const nx = x + DX[d],
          ny = y + DY[d];
        seen.add(this.id(nx, ny));
        stack.push([nx, ny]);
      }
      // the quarter's door to the centre
      this.setOpen(C, C - 1, 2);
      // a few loops inside the quarter, and one passage to the next quarter
      for (let k = 0; k < 3; k++) {
        const x = Math.floor(this.rnd() * (C + 1)),
          y = Math.floor(this.rnd() * C);
        const d = Math.floor(this.rnd() * 4);
        if (this.inQ0(x + DX[d], y + DY[d])) this.setOpen(x, y, d);
      }
      const py = 1 + Math.floor(this.rnd() * (C - 2));
      this.setOpen(C, py, 1);
      this.distCache.clear();
      const len = this.bfs(this.id(C, C))[0];
      const score = -Math.abs(len - 48);
      if (score > bestScore) {
        bestScore = score;
        best = this.open.map((o) => [...o]);
      }
    }
    this.open = best!;
    this.distCache.clear();
  }

  /** Path distances (in cells) from `from` to every cell. */
  private bfs(from: number): number[] {
    const cached = this.distCache.get(from);
    if (cached) return cached;
    const d = new Array(N * N).fill(Infinity);
    d[from] = 0;
    const q = [from];
    for (let h = 0; h < q.length; h++) {
      const c = q[h];
      const [x, y] = this.xy(c);
      for (let k = 0; k < 4; k++) {
        if (!this.open[c][k]) continue;
        const n = this.id(x + DX[k], y + DY[k]);
        if (d[n] === Infinity) {
          d[n] = d[c] + 1;
          q.push(n);
        }
      }
    }
    this.distCache.set(from, d);
    return d;
  }

  // ------------------------------------------------------------ decor

  private buildGarden() {
    const s = this.scene;
    const grass = canvasTex(
      256,
      256,
      (g, w) => {
        g.fillStyle = "#79c95a";
        g.fillRect(0, 0, w, w);
        for (let i = 0; i < 16; i++) {
          g.fillStyle = i % 2 ? "#84d264" : "#72c254";
          g.fillRect(0, (i * w) / 16, w, w / 16);
        }
      },
      true,
    );
    grass.repeat.set(8, 8);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), new THREE.MeshToonMaterial({ map: grass }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    s.add(ground);
    // gravel inside the maze
    const gravel = canvasTex(
      256,
      256,
      (g, w) => {
        g.fillStyle = "#e9dcc0";
        g.fillRect(0, 0, w, w);
        for (let i = 0; i < 500; i++) {
          g.fillStyle = ["#d8c8a6", "#f4ead4", "#cdbb96"][i % 3];
          g.fillRect((i * 131) % w, (i * 71 + i * i) % w, 4, 4);
        }
      },
      true,
    );
    gravel.repeat.set(6, 6);
    const size = N * CELL + 1.2;
    const gr = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshToonMaterial({ map: gravel }));
    gr.rotation.x = -Math.PI / 2;
    gr.position.y = 0.01;
    gr.receiveShadow = true;
    s.add(gr);
    // stone border
    const half = size / 2;
    for (const [x, z, w, d] of [
      [0, -half - 0.3, size + 1.2, 0.6],
      [0, half + 0.3, size + 1.2, 0.6],
      [-half - 0.3, 0, 0.6, size],
      [half + 0.3, 0, 0.6, size],
    ])
      box(s, "#d8cfc0", w, 0.3, d, { x, y: 0.15, z });
    // flower beds and topiaries around
    const cols = ["#ff5a7a", "#ffd23f", "#ffffff", "#b07aff", "#ff8a3e"];
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const r = half + 4.5;
      const x = Math.cos(a) * r,
        z = Math.sin(a) * r;
      cyl(s, "#3f9a3a", 0.2, 1.4, { x, y: 0.7, z, seg: 8 });
      ball(s, "#3fae4a", 1.0, { x, y: 2.1, z });
      ball(s, "#3fae4a", 0.6, { x, y: 3.2, z });
      cyl(s, "#c9925a", 0.8, 0.6, { x, y: 0.3, z, seg: 14 });
    }
    const fl = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 6, 4), flat("#ffffff"), 160);
    const m4 = new THREE.Matrix4();
    let n = 0;
    for (const side of [0, 1, 2, 3])
      for (let k = 0; k < 40; k++) {
        const along = -half + (k / 39) * size;
        const off = half + 1.4 + (k % 2) * 0.5;
        const [x, z] = side === 0 ? [along, -off] : side === 1 ? [along, off] : side === 2 ? [-off, along] : [off, along];
        m4.makeTranslation(x, 0.18, z);
        fl.setMatrixAt(n, m4);
        fl.setColorAt(n, new THREE.Color(cols[(k + side) % cols.length]));
        n++;
      }
    s.add(fl);
    for (const side of [-1, 1]) box(s, "#4f9a3a", size + 2, 0.3, 1.6, { x: 0, y: 0.15, z: side * (half + 1.6), cast: false });
    for (const side of [-1, 1]) box(s, "#4f9a3a", 1.6, 0.3, size + 2, { x: side * (half + 1.6), y: 0.15, z: 0, cast: false });
    // the château at the back
    const ch = group(s, { z: -half - 13 });
    box(ch, "#f1e4c8", 22, 6, 4, { y: 3 });
    box(ch, "#6d7f96", 22.4, 2, 4.4, { y: 6.8 });
    for (const x of [-12, 12]) {
      box(ch, "#efe0c0", 5, 9, 5, { x, y: 4.5 });
      cone(ch, "#6d7f96", 3.6, 3.5, { x, y: 10.7, ry: Math.PI / 4, lo: true });
    }
    for (let k = 0; k < 9; k++) {
      box(ch, "#4a6a8a", 1, 2, 0.1, { x: -8 + k * 2, y: 3, z: 2.05, cast: false });
      box(ch, "#4a6a8a", 1, 1.2, 0.1, { x: -8 + k * 2, y: 0.9 + 4.2, z: 2.05, cast: false });
    }
    for (const [x, z, k] of [
      [-22, -6, 2],
      [22, -6, 2.1],
      [-24, 8, 1.8],
      [24, 9, 1.8],
      [-17, -20, 2.2],
      [18, -21, 2.2],
    ])
      tree(s, x, z, k, "#4fb04a");
  }

  private buildMaze() {
    const segs: { x: number; z: number; w: number; d: number }[] = [];
    const L = CELL + WALL_T;
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const c = this.id(x, y);
        const [wx, wz] = this.w(x, y);
        // each cell owns its top and left edges; the last row/column add bottom/right
        if (!this.open[c][0]) segs.push({ x: wx, z: wz - CELL / 2, w: L, d: WALL_T });
        if (!this.open[c][3]) segs.push({ x: wx - CELL / 2, z: wz, w: WALL_T, d: L });
        if (y === N - 1 && !this.open[c][2]) segs.push({ x: wx, z: wz + CELL / 2, w: L, d: WALL_T });
        if (x === N - 1 && !this.open[c][1]) segs.push({ x: wx + CELL / 2, z: wz, w: WALL_T, d: L });
      }
    const leaf = canvasTex(
      128,
      128,
      (g, w) => {
        g.fillStyle = "#3f9a3a";
        g.fillRect(0, 0, w, w);
        for (let i = 0; i < 160; i++) {
          g.fillStyle = ["#4aae44", "#358a32", "#58bf4e"][i % 3];
          g.beginPath();
          g.arc((i * 53) % w, (i * 29 + (i >> 2) * 7) % w, 5 + (i % 4), 0, Math.PI * 2);
          g.fill();
        }
      },
      true,
    );
    const mat = new THREE.MeshToonMaterial({ map: leaf, color: "#ffffff" });
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, segs.length);
    const top = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.08, 1), toon("#6fd062"), segs.length);
    const m4 = new THREE.Matrix4();
    segs.forEach((sg, k) => {
      m4.makeScale(sg.w, WALL_H, sg.d).setPosition(sg.x, WALL_H / 2, sg.z);
      im.setMatrixAt(k, m4);
      m4.makeScale(sg.w * 0.92, 1, sg.d * 0.8).setPosition(sg.x, WALL_H + 0.02, sg.z);
      top.setMatrixAt(k, m4);
    });
    im.castShadow = im.receiveShadow = true;
    this.scene.add(im, top);
  }

  private buildPavilion() {
    const s = this.scene;
    const [x, z] = this.w(C, C);
    const g = group(s, { x, z });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(CELL * 0.62, 32), toon("#ffe9a0"));
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.03;
    g.add(disc);
    this.glow = new THREE.Mesh(new THREE.RingGeometry(CELL * 0.5, CELL * 0.66, 40), flat("#ffe14a", 0.7, true));
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.position.y = 0.05;
    g.add(this.glow);
    const off = CELL / 2 - 0.05;
    for (const [px, pz] of [
      [-off, -off],
      [off, -off],
      [-off, off],
      [off, off],
    ]) {
      cyl(g, "#fff4dc", 0.11, 1.5, { x: px, y: 0.75, z: pz, seg: 10 });
      ball(g, "#ffc928", 0.16, { x: px, y: 1.55, z: pz, lo: true });
    }
    // an open golden ring roof, so the players inside stay visible
    const roof = new THREE.Mesh(new THREE.TorusGeometry(off * Math.SQRT2, 0.09, 8, 4), toon("#ffc928", "#a07400", 0.25));
    roof.rotation.set(Math.PI / 2, 0, Math.PI / 4);
    roof.position.y = 1.6;
    g.add(roof);
    // the goal: a big golden ⓩ
    this.star = coinMesh(0.95);
    this.star.position.y = 2.9;
    g.add(this.star);
  }

  private placeClovers() {
    // per quarter: one on the way in, one at the end of a dead end near it
    const d0 = this.distC;
    const start = this.id(0, 0);
    const path: number[] = [];
    let c = start;
    while (c !== this.id(C, C) && path.length < 200) {
      path.push(c);
      const [x, y] = this.xy(c);
      let nxt = c;
      for (let k = 0; k < 4; k++) if (this.open[c][k] && d0[this.id(x + DX[k], y + DY[k])] === d0[c] - 1) nxt = this.id(x + DX[k], y + DY[k]);
      if (nxt === c) break;
      c = nxt;
    }
    const picks: number[] = [];
    if (path.length > 6) picks.push(path[Math.floor(path.length * 0.45)]);
    // a dead end two or three steps off the path
    const onPath = new Set(path);
    let bestDead = -1;
    let bestD = 1e9;
    for (let y = 0; y <= C - 1; y++)
      for (let x = 0; x <= C; x++) {
        const cc = this.id(x, y);
        if (onPath.has(cc) || this.open[cc].filter(Boolean).length !== 1) continue;
        // how far from the path?
        const dd = this.bfs(cc);
        let m = 1e9;
        for (const p of path) m = Math.min(m, dd[p]);
        if (m >= 2 && m <= 4 && Math.abs(m - 3) < bestD) {
          bestD = Math.abs(m - 3);
          bestDead = cc;
        }
      }
    if (bestDead >= 0) picks.push(bestDead);
    for (const p of picks) {
      let [x, y] = this.xy(p);
      for (let k = 0; k < 4; k++) {
        const g = this.makeClover();
        const [wx, wz] = this.w(x, y);
        g.position.set(wx, 0.6, wz);
        this.clovers.push({ cell: this.id(x, y), g, respawn: 0 });
        [x, y] = this.rot(x, y);
      }
    }
  }

  private makeClover() {
    const g = group(this.scene);
    const leafM = toon("#22c33e", "#0a8a2a", 0.45);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      const l = group(g, { ry: a });
      ball(l, leafM, [0.16, 0.05, 0.2], { x: 0.1, z: 0.17, ry: 0.5, lo: true });
      ball(l, leafM, [0.16, 0.05, 0.2], { x: -0.1, z: 0.17, ry: -0.5, lo: true });
    }
    cyl(g, "#2a8a32", 0.03, 0.4, { y: -0.2, seg: 5 });
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.5, 24), flat("#2fd94a", 0.8));
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = -0.55;
    g.add(halo);
    g.rotation.x = 0.5;
    g.scale.setScalar(1.3);
    return g;
  }

  // ------------------------------------------------------------ CPU

  /** The direction a CPU wants to take from `cell`, having come by `came` (-1: none). */
  private decide(i: number, cell: number, came: number): number {
    const r = this.run[i];
    const lv = this.players[i].level;
    const [x, y] = this.xy(cell);
    const exits = [0, 1, 2, 3].filter((k) => this.open[cell][k]);
    // a clover close by is worth a detour for good CPUs
    if (r.target === this.id(C, C) && lv > 0.35) {
      for (const cl of this.clovers) {
        if (cl.respawn > 0) continue;
        const d = this.bfs(cl.cell)[cell];
        if (d > 0 && d <= 3 && Math.random() < lv * 0.5) {
          r.target = cl.cell;
          break;
        }
      }
    }
    if (r.target !== this.id(C, C)) {
      const cl = this.clovers.find((k) => k.cell === r.target);
      if (!cl || cl.respawn > 0 || cell === r.target) r.target = this.id(C, C);
    }
    const dist = this.bfs(r.target);
    const right = exits.find((k) => dist[this.id(x + DX[k], y + DY[k])] === dist[cell] - 1) ?? exits[0];
    // wandering down a wrong branch
    if (r.wander > 0) {
      r.wander--;
      const ahead = exits.filter((k) => k !== opp(came));
      if (ahead.length) return ahead[Math.floor(Math.random() * ahead.length)];
      r.wander = 0;
    }
    const junction = exits.length >= 3 || (exits.length === 2 && came < 0);
    if (junction && r.target === this.id(C, C)) {
      if (Math.random() < 0.15 + 0.45 * (1 - lv)) r.pause = 0.12 + Math.random() * (0.2 + 0.5 * (1 - lv));
      const wrong = exits.filter((k) => k !== right && k !== opp(came));
      if (wrong.length && Math.random() < 0.08 + 0.5 * Math.pow(1 - lv, 1.2)) {
        r.wander = 1 + Math.floor(Math.random() * (2 + 4 * (1 - lv)));
        return wrong[Math.floor(Math.random() * wrong.length)];
      }
    }
    return right;
  }

  protected cpu(i: number, dt: number): CpuPad {
    const r = this.run[i];
    if (r.done || this.ended) return {};
    const stick = (d: number): CpuPad => (d < 0 ? {} : { x: DX[d], y: DY[d] });
    if (r.dir < 0) {
      // standing on a cell centre
      const cell = this.id(r.cx, r.cy);
      if (r.planFor !== cell) {
        r.planFor = cell;
        r.planDir = this.decide(i, cell, -1);
      }
      if (r.pause > 0) {
        r.pause -= dt;
        return {};
      }
      return stick(r.planDir);
    }
    if (r.t < 0.35) return stick(r.dir);
    // about to arrive: decide what to do there
    const next = this.id(r.nx, r.ny);
    if (r.planFor !== next) {
      r.planFor = next;
      r.planDir = this.decide(i, next, r.dir);
    }
    if (r.pause > 0) return {};
    return stick(r.planDir);
  }

  // ------------------------------------------------------------ the game

  protected idle(dt: number) {
    this.moveCam([0, 22.5, 14.2], [0, 0, 1.0], dt, 1.3);
    this.spin(dt);
  }

  private spin(dt: number) {
    this.star.rotation.y += dt * 2;
    this.star.position.y = 2.9 + Math.sin(this.t * 3) * 0.12;
    const k = 1 + Math.sin(this.t * 4) * 0.08;
    this.glow.scale.set(k, k, 1);
    for (const c of this.clovers) {
      c.g.rotation.y += dt * 2.5;
      c.g.position.y = 0.6 + Math.sin(this.t * 3 + c.cell) * 0.1;
    }
  }

  protected step(dt: number) {
    const left = TIME - this.t;
    this.hud.timer(left);
    this.moveCam([0, 22.5, 14.2], [0, 0, 1.0], dt, 3);
    this.spin(dt);
    if (!this.hurried && left <= 15) {
      this.hurried = true;
      this.hud.banner(T("15 seconds left!", "还剩 15 秒！"), { color: "#ffd23f" });
      music.speed(1.15);
      this.sound("bell");
    }
    // clovers come back
    for (const c of this.clovers) {
      if (c.respawn > 0) {
        c.respawn -= dt;
        if (c.respawn <= 0) {
          c.g.visible = true;
          this.fx.sparkle(c.g.position, "#9dff7a", 8);
        }
      }
    }
    this.run.forEach((r, i) => {
      const a = this.avatars[i];
      if (r.done) return;
      const p = this.pad(i);
      if (r.boost > 0) {
        r.boost -= dt;
        if (Math.random() < 0.5) this.fx.sparkle({ x: a.pos.x, y: 0.3, z: a.pos.z }, "#9dff7a", 1);
        if (r.boost <= 0) r.label?.firstElementChild?.classList.remove("turbo");
      }
      this.moveRunner(i, p.x, p.y, dt);
      const [x0, z0] = this.w(r.cx, r.cy);
      const [x1, z1] = this.w(r.nx, r.ny);
      const x = x0 + (x1 - x0) * r.t,
        z = z0 + (z1 - z0) * r.t;
      const moving = r.dir >= 0;
      if (moving) a.face(Math.atan2(DX[r.dir], DY[r.dir]), dt, 16);
      a.anim = moving ? "run" : "idle";
      a.speed = r.boost > 0 ? 1 : 0.75;
      a.pos.set(x, 0, z);
      if (moving && Math.random() < dt * 6) this.fx.dust(a.pos, 1, "#e9dcc0");
    });
    // name tags shrink to dots after a few seconds
    if (this.t > 4 && this.t - dt <= 4) for (const r of this.run) r.label?.firstElementChild?.classList.add("small");

    const n = this.players.length;
    if (!this.ended && (this.arrived >= n - 1 || left <= 0)) this.end();
  }

  private moveRunner(i: number, sx: number, sy: number, dt: number) {
    const r = this.run[i];
    const m = Math.hypot(sx, sy);
    let prim = -1,
      sec = -1;
    if (m > 0.4) {
      const ax = Math.abs(sx),
        ay = Math.abs(sy);
      const hx = sx > 0 ? 1 : 3,
        hy = sy < 0 ? 0 : 2;
      prim = ax >= ay ? hx : hy;
      if (Math.min(ax, ay) > 0.3) sec = ax >= ay ? hy : hx;
    }
    const cellOpen = (x: number, y: number, d: number) => d >= 0 && this.open[this.id(x, y)][d];
    if (r.dir < 0) {
      const d = cellOpen(r.cx, r.cy, prim) ? prim : cellOpen(r.cx, r.cy, sec) ? sec : -1;
      if (d < 0) return;
      r.dir = d;
      r.nx = r.cx + DX[d];
      r.ny = r.cy + DY[d];
      r.t = 0;
    } else if (prim === opp(r.dir)) {
      [r.cx, r.nx] = [r.nx, r.cx];
      [r.cy, r.ny] = [r.ny, r.cy];
      r.t = 1 - r.t;
      r.dir = prim;
    }
    r.t += (SPEED * (r.boost > 0 ? TURBO : 1) * dt) / CELL;
    while (r.t >= 1) {
      r.cx = r.nx;
      r.cy = r.ny;
      r.t -= 1;
      this.arrive(i);
      if (r.done) {
        r.t = 0;
        r.dir = -1;
        return;
      }
      let d = -1;
      if (cellOpen(r.cx, r.cy, prim)) d = prim;
      else if (cellOpen(r.cx, r.cy, sec)) d = sec;
      else if (prim >= 0 && prim !== opp(r.dir) && cellOpen(r.cx, r.cy, r.dir)) d = r.dir;
      if (d < 0) {
        r.dir = -1;
        r.t = 0;
        r.nx = r.cx;
        r.ny = r.cy;
        return;
      }
      r.dir = d;
      r.nx = r.cx + DX[d];
      r.ny = r.cy + DY[d];
    }
  }

  private arrive(i: number) {
    const r = this.run[i];
    const cell = this.id(r.cx, r.cy);
    const a = this.avatars[i];
    for (const c of this.clovers) {
      if (c.cell !== cell || c.respawn > 0) continue;
      c.respawn = CLOVER_RESPAWN;
      c.g.visible = false;
      r.boost = TURBO_T;
      r.label?.firstElementChild?.classList.add("turbo");
      this.sound("power");
      this.fx.sparkle(c.g.position, "#9dff7a", 18);
      this.hud.pop(c.g.position.clone().setY(1.6), T("Turbo!", "加速！"), "#9dff7a", this.camera);
      this.buzz(i, 40);
    }
    if (cell === this.id(C, C) && !r.done) {
      r.done = true;
      this.arrived++;
      r.place = this.arrived;
      const p = this.players[i];
      this.hud.setScore(p.i, placeTxt(r.place));
      this.hud.mark(p.i, "win", r.place === 1);
      if (r.label) this.hud.removeLabel(r.label);
      r.label = null;
      const offs = [
        [-0.36, -0.36],
        [0.36, -0.36],
        [-0.36, 0.36],
        [0.36, 0.36],
      ][r.place - 1];
      const [x, z] = this.w(C, C);
      a.pos.set(x + offs[0], 0, z + offs[1]);
      a.yaw = 0;
      a.anim = r.place === 1 ? "win" : "dance";
      this.fx.confetti({ x, y: 2.5, z }, r.place === 1 ? 60 : 25);
      this.sound(r.place === 1 ? "fanfare" : "star");
      if (r.place === 1) this.hud.banner(T(`${p.name} finds the golden Z!`, `${p.name} 找到了金色 Z！`), { color: p.char.color, size: 6 });
      this.buzz(i, [60, 40, 60]);
    }
  }

  private end() {
    this.ended = true;
    // the rest are ranked by how far they still are from the centre
    const left = this.run.map((r, i) => ({ i, r })).filter((o) => !o.r.done);
    const remain = (r: Runner) => {
      const d0 = this.distC[this.id(r.cx, r.cy)];
      const d1 = this.distC[this.id(r.nx, r.ny)];
      return d0 + (d1 - d0) * r.t;
    };
    left.sort((a, b) => remain(a.r) - remain(b.r));
    const place = this.run.map((r) => r.place);
    let next = this.arrived + 1;
    left.forEach((o, k) => {
      if (k > 0 && Math.abs(remain(o.r) - remain(left[k - 1].r)) < 0.01) place[o.i] = place[left[k - 1].i];
      else place[o.i] = next;
      next++;
    });
    this.run.forEach((r, i) => {
      if (r.label) this.hud.removeLabel(r.label);
      r.label = null;
      if (!r.done) this.hud.setScore(this.players[i].i, placeTxt(place[i]));
    });
    this.finish(place);
  }

  protected outroStep(dt: number) {
    this.spin(dt);
  }
}

void clamp;

const def: MiniDef = {
  id: "labyrinthe",
  name: "The Maze",
  icon: "🧩",
  color: "#4fc3a1",
  tagline: "Find the way out of the maze before the others.",
  rules: "Find the path to the golden Z in the maze's heart. The turbo clovers make you dash for a few seconds. First there wins!",
  controls: { stick: "Run the alleys" },
  modes: ["ffa"],
  length: 40,
  music: "mini2",
  create: (ctx) => new Labyrinthe(ctx),
};
export default def;
