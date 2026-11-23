/**
 * COULEUR EXPRESS (chacun pour soi): a 6×6 floor of coloured tiles floats high above a tropical
 * sea. A sign held up by two balloons calls a colour; when its countdown runs out every tile of
 * another colour drops into the sea, with whoever stands on it. The tiles come back with new
 * colours, and the countdown shrinks (3 s → 1,2 s) while the safe tiles get fewer.
 * Last one standing wins; after 10 rounds the survivors share the win.
 */
import * as THREE from "three";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef } from "../types";
import { FONT_TITLE, GEO, ball, box, canvasTex, cloud, cone, cyl, flat, group, toon } from "../../engine/gfx";
import { clamp, easeOutBack, shuffle } from "../../engine/util";
import { music } from "../../engine/audio";
import { T } from "../../../../i18n/lang";

const N = 6; // tiles per side
const PITCH = 2.3;
const TS = 2.14; // tile size
const TH = 0.6; // tile thickness
const HALF = (N * PITCH) / 2;
const SEA_Y = -17;
const ROUNDS = 10;
const PR = 0.42; // player radius
const SPEED = 6.3;
const HOP_V = 6.6;
const GRAV = 24;
const LUNGE = 4.6;
const SIGN_Y = 4.6;
const CAM: [number, number, number] = [0, 13.2, 17.5];
const LOOK: [number, number, number] = [0, 0.6, -2.2];

type Sym = "circle" | "star" | "triangle" | "square" | "heart";
const COLS: { en: string; zh: string; hex: string; dark: string; sym: Sym }[] = [
  { en: "RED", zh: "红色", hex: "#ff3d3d", dark: "#a8202c", sym: "circle" },
  { en: "YELLOW", zh: "黄色", hex: "#ffd23f", dark: "#c08d10", sym: "star" },
  { en: "GREEN", zh: "绿色", hex: "#35cf58", dark: "#1d8638", sym: "triangle" },
  { en: "BLUE", zh: "蓝色", hex: "#2f8dff", dark: "#1a55b8", sym: "square" },
  { en: "PURPLE", zh: "紫色", hex: "#a65cff", dark: "#6430b0", sym: "heart" },
];
/** A colour's name in the page's language. */
const cname = (c: (typeof COLS)[number]) => T(c.en, c.zh);

type Phase = "wait" | "flip" | "call" | "drop" | "over";
type TileState = "solid" | "fall" | "gone" | "rise";

interface Tile {
  m: THREE.Mesh;
  x: number;
  z: number;
  c: number;
  next: number;
  state: TileState;
  y: number;
  vy: number;
  spinX: number;
  spinZ: number;
  delay: number;
  swapped: boolean;
}

interface Runner {
  x: number;
  z: number;
  y: number;
  vx: number;
  vz: number;
  vy: number;
  air: boolean;
  falling: boolean;
  splashed: boolean;
  out: boolean;
  /** Round in which the player fell (for the ranking). */
  outRound: number;
  /** Shoved: no control for a moment. */
  stun: number;
}

interface Brain {
  react: number;
  target: number;
  mistake: boolean;
  wx: number;
  wz: number;
}

function drawSym(g: CanvasRenderingContext2D, sym: Sym, cx: number, cy: number, r: number) {
  g.beginPath();
  if (sym === "circle") g.arc(cx, cy, r, 0, Math.PI * 2);
  else if (sym === "square") g.roundRect(cx - r * 0.85, cy - r * 0.85, r * 1.7, r * 1.7, r * 0.2);
  else if (sym === "triangle") {
    g.moveTo(cx, cy - r);
    g.lineTo(cx + r * 0.95, cy + r * 0.75);
    g.lineTo(cx - r * 0.95, cy + r * 0.75);
    g.closePath();
  } else if (sym === "star") {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 ? r * 0.45 : r;
      g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    g.closePath();
  } else {
    // heart
    g.moveTo(cx, cy + r * 0.85);
    g.bezierCurveTo(cx - r * 1.3, cy - r * 0.1, cx - r * 0.6, cy - r * 1.05, cx, cy - r * 0.4);
    g.bezierCurveTo(cx + r * 0.6, cy - r * 1.05, cx + r * 1.3, cy - r * 0.1, cx, cy + r * 0.85);
    g.closePath();
  }
  g.fill();
}

class CouleurExpress extends BaseMini {
  private tiles: Tile[] = [];
  private run: Runner[] = [];
  private brains: Brain[] = [];
  private phase: Phase = "wait";
  private phaseT = 0;
  private round = 0;
  private target = 0;
  private lastTarget = -1;
  private callDur = 3;
  private overT = 0;
  private ticked = 0;
  private boxMats: THREE.Material[][] = [];
  private dimMats: THREE.Material[][] = [];
  private signMats: THREE.MeshBasicMaterial[] = [];
  private signReady!: THREE.MeshBasicMaterial;
  private ownTex: THREE.Texture[] = [];
  private signPanel!: THREE.Mesh;
  private signGroup!: THREE.Group;
  private barFill!: THREE.Mesh;
  private barMat = new THREE.MeshBasicMaterial({ color: "#ffffff" });
  private balloons: THREE.Object3D[] = [];
  private sea!: THREE.Mesh;
  private seaTex!: THREE.Texture;
  private gulls: { g: THREE.Group; wl: THREE.Mesh; wr: THREE.Mesh; r: number; h: number; ph: number; sp: number }[] = [];
  private airBalloons: { g: THREE.Group; x0: number; ph: number }[] = [];
  private roundEl!: HTMLElement;

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#3f9cff", "#cfeeff"], size: 12, sun: [0.4, 1, 0.55], fog: { color: "#bfe6ff", near: 45, far: 140 } });
    this.makeMaterials();
    this.buildWorld();
    this.buildTiles();
    this.buildSign();
    const starts = [
      [-2.3, -2.3],
      [2.3, -2.3],
      [-2.3, 2.3],
      [2.3, 2.3],
    ];
    this.players.forEach((p, i) => {
      const [x, z] = starts[i];
      const a = this.spawn(i, x, z, 0);
      a.setRing(p.char.color);
      this.run.push({ x, z, y: 0, vx: 0, vz: 0, vy: 0, air: false, falling: false, splashed: false, out: false, outRound: 0, stun: 0 });
      this.brains.push({ react: 0.5, target: -1, mistake: false, wx: 0, wz: 0 });
    });
    this.hud.players(this.players, () => T("In play", "在场"));
    this.roundEl = this.hud.add(
      `<div style="position:absolute;left:calc(var(--u)*1.2);top:50%;transform:translateY(-50%);padding:calc(var(--u)*0.6) calc(var(--u)*1.4);background:rgba(20,14,40,0.75);color:#fff;border-radius:calc(var(--u)*2);font-family:var(--title);font-size:calc(var(--u)*2);text-align:center;line-height:1.05">${T("Round", "回合")}<br><span class="rn" style="font-size:calc(var(--u)*4.2);color:#ffd23f">1</span><span style="opacity:0.7"> / ${ROUNDS}</span></div>`,
    );
    this.setCam([0, 26, 34], [0, 0, -2], 40);
  }

  // ------------------------------------------------------------ materials

  private makeMaterials() {
    for (const c of COLS) {
      const top = (dim: boolean) => {
        const tex = canvasTex(256, 256, (g, w) => {
          g.fillStyle = dim ? c.dark : c.hex;
          g.fillRect(0, 0, w, w);
          g.strokeStyle = "rgba(255,255,255,0.55)";
          g.lineWidth = 14;
          g.beginPath();
          g.roundRect(18, 18, w - 36, w - 36, 30);
          g.stroke();
          g.fillStyle = dim ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.6)";
          drawSym(g, c.sym, w / 2, w / 2 + (c.sym === "triangle" ? 8 : 0), 62);
        });
        this.ownTex.push(tex);
        return new THREE.MeshToonMaterial({ map: tex, color: "#ffffff" });
      };
      const side = toon(c.dark);
      const under = toon("#e9f2ff");
      const t0 = top(false),
        t1 = top(true);
      this.boxMats.push([side, side, t0, under, side, side]);
      this.dimMats.push([toon("#2a2440"), toon("#2a2440"), t1, under, toon("#2a2440"), toon("#2a2440")]);
      const sign = canvasTex(640, 320, (g, w, h) => {
        g.fillStyle = c.hex;
        g.beginPath();
        g.roundRect(0, 0, w, h, 40);
        g.fill();
        g.strokeStyle = "#ffffff";
        g.lineWidth = 18;
        g.beginPath();
        g.roundRect(14, 14, w - 28, h - 28, 30);
        g.stroke();
        g.fillStyle = "#ffffff";
        drawSym(g, c.sym, 130, h / 2 + (c.sym === "triangle" ? 10 : 0), 78);
        const name = cname(c);
        // (the biggest size that fits beside the symbol)
        let px = 130;
        g.font = `${px}px ${FONT_TITLE}`;
        while (px > 60 && g.measureText(name).width > 370) g.font = `${(px -= 6)}px ${FONT_TITLE}`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.lineWidth = 18;
        g.lineJoin = "round";
        g.strokeStyle = "#1d1630";
        g.strokeText(name, 400, h / 2 + 8);
        g.fillText(name, 400, h / 2 + 8);
      });
      this.ownTex.push(sign);
      this.signMats.push(new THREE.MeshBasicMaterial({ map: sign }));
    }
    const ready = canvasTex(640, 320, (g, w, h) => {
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.roundRect(0, 0, w, h, 40);
      g.fill();
      const cols = COLS.map((c) => c.hex);
      for (let i = 0; i < 5; i++) {
        g.fillStyle = cols[i];
        g.beginPath();
        g.arc(110 + i * 105, 250, 26, 0, Math.PI * 2);
        g.fill();
      }
      g.font = `118px ${FONT_TITLE}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = "#1d1630";
      g.fillText(T("READY?", "准备好了吗？"), w / 2, 120);
    });
    this.ownTex.push(ready);
    this.signReady = new THREE.MeshBasicMaterial({ map: ready });
  }

  // ------------------------------------------------------------ the world

  private buildWorld() {
    const s = this.scene;
    // the sea far below, with drifting waves
    this.seaTex = canvasTex(
      256,
      256,
      (g, w) => {
        g.fillStyle = "#1f9ad8";
        g.fillRect(0, 0, w, w);
        g.strokeStyle = "rgba(255,255,255,0.35)";
        g.lineWidth = 5;
        g.lineCap = "round";
        for (let i = 0; i < 18; i++) {
          const x = (i * 97) % w,
            y = (i * 53) % w;
          g.beginPath();
          g.arc(x, y, 16, Math.PI * 1.1, Math.PI * 1.9);
          g.stroke();
        }
      },
      true,
    );
    this.seaTex.repeat.set(40, 40);
    this.ownTex.push(this.seaTex);
    this.sea = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshToonMaterial({ map: this.seaTex, color: "#ffffff" }));
    this.sea.rotation.x = -Math.PI / 2;
    this.sea.position.y = SEA_Y;
    s.add(this.sea);
    // islands on the horizon
    const isles: [number, number, number][] = [
      [-48, -70, 1.4],
      [30, -85, 2],
      [70, -40, 1.1],
      [-80, -20, 1.6],
      [55, 30, 1.2],
    ];
    for (const [x, z, k] of isles) {
      const g = group(s, { x, y: SEA_Y, z });
      cyl(g, "#ffe3a3", 7 * k, 1.2, { y: 0.3, rTop: 6 * k, seg: 20, cast: false });
      cone(g, "#4cbf55", 5 * k, 5 * k, { y: 3 * k, lo: true, cast: false });
      cone(g, "#3aa648", 3.2 * k, 6 * k, { x: 2 * k, y: 3.5 * k, z: 1 * k, lo: true, cast: false });
      for (let p = 0; p < 2; p++) {
        const px = (p ? -4 : 4.5) * k;
        cyl(g, "#9a6a3a", 0.25 * k, 4 * k, { x: px, y: 2.4 * k, rz: p ? 0.2 : -0.2, cast: false });
        for (let l = 0; l < 4; l++) {
          const a = (l / 4) * Math.PI * 2;
          ball(g, "#3fb84a", [1.6 * k, 0.3 * k, 0.6 * k], { x: px + Math.cos(a) * 1.1 * k - (p ? 0.8 : -0.8) * k, y: 4.4 * k, z: Math.sin(a) * 1.1 * k, ry: -a, lo: true, cast: false });
        }
      }
    }
    // a lighthouse on the nearest island
    const lh = group(s, { x: 30, y: SEA_Y + 1, z: -85 });
    cyl(lh, "#ffffff", 1.4, 10, { y: 5, rTop: 1.0, seg: 16, cast: false });
    cyl(lh, "#ff4b3e", 1.3, 2, { y: 3, rTop: 1.25, seg: 16, cast: false });
    cyl(lh, "#ff4b3e", 1.1, 2, { y: 7, rTop: 1.05, seg: 16, cast: false });
    ball(lh, flat("#fff3a0"), 1, { y: 10.8, cast: false });
    cone(lh, "#ff4b3e", 1.3, 1.6, { y: 12.2, cast: false });
    // clouds, some below the floor, some far away
    const cl: [number, number, number, number][] = [
      [-17, -6, -6, 2.2],
      [16, -7, -3, 2.4],
      [-14, -9, 9, 2],
      [18, -5, 10, 1.8],
      [0, -10, 14, 2.6],
      [-6, -12, -14, 2.4],
      [26, 4, -30, 3],
      [-30, 6, -36, 3.4],
      [-40, -2, 0, 3],
      [42, 0, -8, 3.2],
      [8, 9, -55, 4],
      [-22, -14, 22, 2.4],
    ];
    for (const [x, y, z, k] of cl) cloud(s, x, y, z, k);
    // two hot-air balloons drifting
    const bcols = [
      ["#ff7a3d", "#ffd23f"],
      ["#3fcf9a", "#ffffff"],
    ];
    for (let b = 0; b < 2; b++) {
      const g = group(s, { x: b ? 34 : -36, y: b ? 2 : 8, z: b ? -24 : -40 });
      ball(g, bcols[b][0], [3, 3.6, 3], { y: 4, cast: false });
      cyl(g, bcols[b][1], 3.05, 1.4, { y: 4, seg: 20, cast: false });
      cyl(g, "#8a5a32", 0.8, 0.9, { y: -0.6, cast: false });
      for (const [dx, dz] of [
        [-0.6, -0.6],
        [0.6, 0.6],
      ])
        cyl(g, "#5a4030", 0.04, 2.6, { x: dx, y: 0.9, z: dz, cast: false });
      this.airBalloons.push({ g, x0: g.position.x, ph: b * 2 });
    }
    // seagulls circling
    const wing = new THREE.BoxGeometry(1, 0.06, 0.4);
    for (let k = 0; k < 4; k++) {
      const g = group(s);
      ball(g, "#ffffff", [0.22, 0.18, 0.45], { cast: false });
      const wl = new THREE.Mesh(wing, toon("#ffffff"));
      const wr = new THREE.Mesh(wing, toon("#ffffff"));
      wl.position.x = -0.55;
      wr.position.x = 0.55;
      g.add(wl, wr);
      ball(g, "#ffb02e", [0.06, 0.06, 0.14], { z: 0.48, cast: false });
      this.gulls.push({ g, wl, wr, r: 22 + k * 5, h: 3 + k * 2, ph: k * 1.7, sp: 0.18 + k * 0.03 });
    }
  }

  private buildTiles() {
    const geo = new THREE.BoxGeometry(TS, TH, TS);
    // first colours: an even, shuffled mix
    const cols = shuffle(
      this.rnd,
      Array.from({ length: N * N }, (_, k) => k % 4),
    );
    for (let iz = 0; iz < N; iz++)
      for (let ix = 0; ix < N; ix++) {
        const x = -HALF + PITCH / 2 + ix * PITCH;
        const z = -HALF + PITCH / 2 + iz * PITCH;
        const c = cols[iz * N + ix];
        const m = new THREE.Mesh(geo, this.boxMats[c]);
        m.position.set(x, -TH / 2, z);
        m.castShadow = m.receiveShadow = true;
        this.scene.add(m);
        this.tiles.push({ m, x, z, c, next: c, state: "solid", y: 0, vy: 0, spinX: 0, spinZ: 0, delay: 0, swapped: true });
      }
  }

  private buildSign() {
    const g = group(this.scene, { x: 0, y: SIGN_Y, z: -HALF - 3.2, rx: 0.18 });
    this.signGroup = g;
    box(g, "#1d1630", 9.6, 5.0, 0.35, { y: 0 });
    this.signPanel = new THREE.Mesh(GEO.plane, this.signReady);
    this.signPanel.scale.set(9, 4.5, 1);
    this.signPanel.position.set(0, 0.15, 0.19);
    g.add(this.signPanel);
    // the countdown bar under the panel
    box(g, "#1d1630", 9.6, 0.8, 0.4, { y: -2.85 });
    this.barFill = new THREE.Mesh(GEO.box, this.barMat);
    this.barFill.scale.set(9.1, 0.42, 0.1);
    this.barFill.position.set(0, -2.85, 0.22);
    g.add(this.barFill);
    // held up by two big balloons
    for (const sx of [-1, 1]) {
      const b = group(g, { x: sx * 4.2, y: 2.5 });
      cyl(b, "#ffffff", 0.03, 3, { y: 1.5, cast: false });
      ball(b, sx < 0 ? "#ff4b6a" : "#3fb8ff", [1.25, 1.5, 1.25], { y: 4.1 });
      cone(b, sx < 0 ? "#ff4b6a" : "#3fb8ff", 0.25, 0.35, { y: 2.55, rx: Math.PI, lo: true });
      ball(b, flat("#ffffff", 0.6), 0.28, { x: -0.45, y: 4.6, z: 0.95, cast: false });
      this.balloons.push(b);
    }
  }

  // ------------------------------------------------------------ helpers

  private tileAt(x: number, z: number): Tile | null {
    const ix = Math.floor((x + HALF) / PITCH),
      iz = Math.floor((z + HALF) / PITCH);
    if (ix < 0 || iz < 0 || ix >= N || iz >= N) return null;
    return this.tiles[iz * N + ix];
  }
  /** Is there floor under (x, z)? A little leniency at the edges of safe tiles. */
  private solidUnder(x: number, z: number) {
    const m = TS / 2 + 0.18;
    for (const t of this.tiles) {
      if (t.state !== "solid" && t.state !== "rise") continue;
      if (Math.abs(x - t.x) <= m && Math.abs(z - t.z) <= m) return true;
    }
    return false;
  }
  private alive() {
    return this.run.filter((r) => !r.out).length;
  }

  // ------------------------------------------------------------ rounds

  start() {
    this.beginFlip();
  }

  private beginFlip() {
    this.round++;
    this.phase = "flip";
    this.phaseT = 0;
    (this.roundEl.querySelector(".rn") as HTMLElement).textContent = String(this.round);
    this.signPanel.material = this.signReady;
    this.barFill.visible = false;
    // the new colours: the target gets fewer tiles each round
    const nc = this.round <= 3 ? 4 : 5;
    let t = Math.floor(this.rnd() * nc);
    if (t === this.lastTarget) t = (t + 1 + Math.floor(this.rnd() * (nc - 1))) % nc;
    this.target = t;
    this.lastTarget = t;
    const k = [8, 7, 6, 5, 4, 3, 3, 2, 2, 1][this.round - 1] ?? 1;
    const order = shuffle(
      this.rnd,
      this.tiles.map((_, i) => i),
    );
    const others = Array.from({ length: nc }, (_, c) => c).filter((c) => c !== t);
    if (this.round === ROUNDS) {
      // the finale: a single safe tile, one of the four in the middle, and a shoving match
      const mid = [2 * N + 2, 2 * N + 3, 3 * N + 2, 3 * N + 3];
      const pick = mid[Math.floor(this.rnd() * mid.length)];
      order.splice(order.indexOf(pick), 1);
      order.unshift(pick);
    }
    order.forEach((ti, n) => {
      this.tiles[ti].next = n < k ? t : others[n % others.length];
    });
    for (const tile of this.tiles) {
      tile.delay = Math.hypot(tile.x, tile.z) * 0.035 + this.rnd() * 0.08;
      tile.swapped = false;
      if (tile.state === "gone") {
        tile.state = "rise";
        tile.c = tile.next;
        tile.m.material = this.boxMats[tile.c];
        tile.y = -10;
        tile.m.visible = true;
        tile.m.rotation.set(0, 0, 0);
        tile.swapped = true;
      }
    }
    this.sound("magic");
    if (this.round === ROUNDS) this.hud.banner(T("FINAL!", "决赛！"), { color: "#ffd23f", ms: 1000, sub: T("One safe tile… shove the others!", "只剩一块地砖……把别人撞开！") });
    else if (this.round === 6) {
      this.hud.banner(T("FASTER!", "加速！"), { color: "#ff7a3d", ms: 550, sub: T("Fewer safe tiles", "安全地砖更少了") });
      music.speed(1.12);
    }
  }

  private beginCall() {
    this.phase = "call";
    this.phaseT = 0;
    this.ticked = 0;
    this.callDur = this.round === ROUNDS ? 2.2 : Math.max(1.2, 3 - (this.round - 1) * 0.2);
    const c = COLS[this.target];
    this.signPanel.material = this.signMats[this.target];
    this.barFill.visible = true;
    this.barMat.color.set(c.hex);
    this.hud.banner(T(`${c.en}!`, `${c.zh}！`), { color: c.hex, ms: 650, size: 8 });
    this.sound("ding");
    this.hud.tip(T(`Get on <b style="color:${c.hex}">${c.en}</b>!`, `快站到<b style="color:${c.hex}">${c.zh}</b>上！`));
    this.run.forEach((_, i) => {
      if (!this.players[i].cpu) return;
      const lv = this.players[i].level;
      const b = this.brains[i];
      b.react = 0.2 + (1 - lv) * 0.6 + Math.random() * 0.3;
      b.target = -1;
      b.mistake = Math.random() < (1 - lv) * 0.2;
      this.cpuReset(i, "react");
      this.cpuReset(i, "fix");
    });
    this.signGroup.scale.setScalar(1.12);
  }

  private beginDrop() {
    this.phase = "drop";
    this.phaseT = 0;
    this.hud.tip(null);
    let n = 0;
    for (const t of this.tiles) {
      if (t.c === this.target || t.state !== "solid") continue;
      t.state = "fall";
      t.vy = 1.5 + this.rnd() * 1.5;
      t.spinX = (this.rnd() - 0.5) * 3;
      t.spinZ = (this.rnd() - 0.5) * 3;
      if (n++ % 3 === 0) this.fx.dust({ x: t.x, y: 0, z: t.z }, 5, "#ffffff");
    }
    this.sound("crash");
    this.sound("whoosh");
    this.shake = 0.35;
  }

  private fallPlayer(i: number) {
    const r = this.run[i];
    if (r.out) return;
    r.out = true;
    r.falling = true;
    r.outRound = this.round;
    r.vy = Math.min(r.vy, 1.5);
    this.avatars[i].anim = "fall";
    this.avatars[i].setRing(null);
    this.hud.mark(this.players[i].seat, "out");
    this.hud.setScore(this.players[i].seat, T("Fell!", "掉下去了！"));
    this.sound("slide");
    this.buzz(i, [80, 40, 120]);
  }

  private endGame() {
    if (this.phase === "over") return;
    this.phase = "over";
    this.hud.tip(null);
    // ties: players who fell in the same round share their place
    const place = this.run.map((r) => 1 + this.run.filter((o) => (r.out ? !o.out || o.outRound > r.outRound : false)).length);
    this.run.forEach((r, i) => {
      if (!r.out) this.hud.mark(this.players[i].seat, "win");
    });
    this.finish(place);
  }

  // ------------------------------------------------------------ CPUs

  protected cpu(i: number, dt: number): CpuPad {
    const me = this.run[i];
    if (me.out) return {};
    const lv = this.players[i].level;
    const b = this.brains[i];
    const goTo = (tx: number, tz: number, slow = 0.25): CpuPad => {
      const dx = tx - me.x,
        dz = tz - me.z;
      const d = Math.hypot(dx, dz);
      if (d < slow) return {};
      const k = clamp(d / 0.9, 0.35, 1);
      return { x: (dx / d) * k, y: (dz / d) * k };
    };
    if (this.phase === "call") {
      if (!this.cpuAfter(i, "react", b.react)) return {};
      if (b.mistake && this.cpuAfter(i, "fix", 0.35 + (1 - lv) * 0.45)) {
        b.mistake = false;
        b.target = -1;
      }
      const tgt = b.target >= 0 ? this.tiles[b.target] : null;
      const want = b.mistake ? -1 : this.target;
      if (!tgt || (want >= 0 && tgt.next !== want)) {
        // pick the best tile: near, and not crowded by the others
        let best = -1,
          bestS = Infinity;
        this.tiles.forEach((t, ti) => {
          if (t.state !== "solid") return;
          if (want >= 0 ? t.next !== want : t.next === this.target) return;
          let s = Math.hypot(t.x - me.x, t.z - me.z);
          for (let j = 0; j < this.run.length; j++) {
            if (j === i || this.run[j].out) continue;
            const o = this.run[j];
            if (this.brains[j].target === ti || Math.hypot(o.x - t.x, o.z - t.z) < 1.1) s += 1.4 * lv + 0.4;
          }
          s += Math.random() * (1 - lv) * 2.5;
          if (s < bestS) {
            bestS = s;
            best = ti;
          }
        });
        b.target = best;
        b.wx = (Math.random() - 0.5) * 0.7;
        b.wz = (Math.random() - 0.5) * 0.7;
      }
      if (b.target < 0) return {};
      const t = this.tiles[b.target];
      // on our tile with a rival close by: hop into them to push them off
      if (Math.hypot(me.x - t.x, me.z - t.z) < 0.9 && !me.air) {
        for (let j = 0; j < this.run.length; j++) {
          const o = this.run[j];
          if (j === i || o.out || o.air) continue;
          const d = Math.hypot(o.x - me.x, o.z - me.z);
          if (d < 1.4 && d > 0.3 && Math.random() < dt * lv * 1.6) return { x: (o.x - me.x) / d, y: (o.z - me.z) / d, a: true };
        }
      }
      return goTo(t.x + b.wx, t.z + b.wz, 0.2);
    }
    if (this.phase === "drop") {
      if (b.target >= 0) {
        const t = this.tiles[b.target];
        if (t.state === "solid") return goTo(t.x + b.wx, t.z + b.wz, 0.2);
      }
      return {};
    }
    // between calls: good players drift toward the middle, the others wander
    if (this.phase === "flip") {
      if (this.phaseT < 0.05) {
        const spread = 1.2 + (1 - lv) * 3.5;
        b.wx = (Math.random() - 0.5) * 2 * spread;
        b.wz = (Math.random() - 0.5) * 2 * spread;
      }
      const cx = me.x * (1 - lv) * 0.7,
        cz = me.z * (1 - lv) * 0.7;
      const p = goTo(cx + b.wx, cz + b.wz, 0.4);
      return { ...p, a: Math.random() < 0.006 };
    }
    return {};
  }

  // ------------------------------------------------------------ frame

  protected idle(dt: number) {
    this.animWorld(dt);
    this.moveCam(CAM, LOOK, dt, 1.5);
  }

  protected step(dt: number) {
    this.phaseT += dt;
    this.animWorld(dt);
    this.moveCam(CAM, LOOK, dt, 3);

    // ---- the round's phases
    if (this.phase === "flip") {
      if (this.phaseT >= (this.round === ROUNDS ? 1.9 : 1.0)) this.beginCall();
    } else if (this.phase === "call") {
      const left = this.callDur - this.phaseT;
      this.barFill.scale.x = Math.max(0.001, 9.1 * (left / this.callDur));
      this.barFill.position.x = -4.55 + this.barFill.scale.x / 2;
      const sec = Math.ceil(left / 0.5);
      if (sec !== this.ticked && left > 0) {
        this.ticked = sec;
        this.sound(left < 0.8 ? "count" : "tick");
      }
      if (left <= 0) this.beginDrop();
    } else if (this.phase === "drop") {
      if (this.phaseT >= 1.6) {
        if (this.alive() <= 1 || this.round >= ROUNDS) {
          this.overT += dt;
          if (this.overT > 0.4 || this.alive() === 0) this.endGame();
        } else this.beginFlip();
      }
    }
    if (this.phase === "over") return;

    // ---- tiles
    for (const t of this.tiles) this.animTile(t, dt);

    // ---- players
    this.run.forEach((r, i) => {
      const a = this.avatars[i];
      if (r.falling) {
        r.vy -= 30 * dt;
        r.y += r.vy * dt;
        r.x += r.vx * dt;
        r.z += r.vz * dt;
        r.vx *= Math.exp(-1 * dt);
        r.vz *= Math.exp(-1 * dt);
        a.pos.set(r.x, r.y, r.z);
        a.model.rotation.x += dt * 2;
        a.groundY = SEA_Y;
        if (r.y < SEA_Y + 0.5 && !r.splashed) {
          r.splashed = true;
          this.fx.splash({ x: r.x, y: SEA_Y + 0.3, z: r.z }, "#bfe8ff");
          this.sound("splash");
          a.setVisible(false);
        }
        return;
      }
      const p = this.pad(i);
      const tx = p.x * SPEED,
        tz = p.y * SPEED;
      const k = 1 - Math.exp(-(r.stun > 0 ? 1.5 : r.air ? 5 : 13) * dt);
      if (r.stun > 0) {
        r.stun -= dt;
        r.vx -= r.vx * k;
        r.vz -= r.vz * k;
      } else {
        r.vx += (tx - r.vx) * k;
        r.vz += (tz - r.vz) * k;
      }
      if (p.aDown && !r.air && r.stun <= 0) {
        r.air = true;
        r.vy = HOP_V;
        // a little lunge in the stick's direction (to shove someone)
        const l = Math.hypot(p.x, p.y);
        if (l > 0.3) {
          r.vx = (p.x / l) * LUNGE;
          r.vz = (p.y / l) * LUNGE;
        }
        this.sound("jump");
      }
      if (r.air) {
        r.y += (r.vy - GRAV * dt * 0.5) * dt;
        r.vy -= GRAV * dt;
        if (r.y <= 0) {
          r.y = 0;
          r.vy = 0;
          r.air = false;
          this.fx.dust({ x: r.x, y: 0, z: r.z }, 5);
        }
      }
      r.x = clamp(r.x + r.vx * dt, -HALF + PR, HALF - PR);
      r.z = clamp(r.z + r.vz * dt, -HALF + PR, HALF - PR);
      const sp = Math.hypot(r.vx, r.vz);
      if (sp > 0.5) a.face(Math.atan2(r.vx, r.vz), dt);
      else a.face(0, dt, 4);
      a.anim = r.stun > 0 ? "stun" : r.air ? "jump" : sp > 0.6 ? "run" : "idle";
      a.speed = clamp(sp / SPEED, 0, 1);
      // nothing under the feet → fall
      if (!r.air && !this.solidUnder(r.x, r.z)) this.fallPlayer(i);
      const under = this.tileAt(r.x, r.z);
      a.groundY = under && (under.state === "solid" || under.state === "rise") ? under.m.position.y + TH / 2 : SEA_Y;
      a.pos.set(r.x, r.y + (under && !r.air && under.state === "solid" ? under.m.position.y + TH / 2 : 0), r.z);
    });
    // bumps between players (a hop lands with a shove)
    for (let i = 0; i < this.run.length; i++)
      for (let j = i + 1; j < this.run.length; j++) {
        const A = this.run[i],
          B = this.run[j];
        if (A.falling || B.falling) continue;
        if (Math.abs(A.y - B.y) > 1.0) continue;
        const dx = B.x - A.x,
          dz = B.z - A.z;
        const d = Math.hypot(dx, dz);
        if (d < PR * 2 && d > 1e-4) {
          const push = (PR * 2 - d) / 2;
          const nx = dx / d,
            nz = dz / d;
          A.x -= nx * push;
          A.z -= nz * push;
          B.x += nx * push;
          B.z += nz * push;
          const rel = (A.vx - B.vx) * nx + (A.vz - B.vz) * nz;
          if (Math.abs(rel) > 2.5) {
            // whoever rams the other shoves them; a hop into someone sends them sliding
            const [att, vic, sg] = rel > 0 ? [A, B, 1] : [B, A, -1];
            const kick = Math.abs(rel) * (att.air ? 0.95 : 0.5);
            vic.vx += nx * sg * kick;
            vic.vz += nz * sg * kick;
            if (att.air) vic.stun = 0.4;
            att.vx -= nx * sg * kick * 0.3;
            att.vz -= nz * sg * kick * 0.3;
            this.sound("bonk");
            this.fx.burst({ x: (A.x + B.x) / 2, y: 0.9, z: (A.z + B.z) / 2 }, { count: 6, colors: ["#ffffff", "#ffe14a"], speed: 3, size: 0.12 });
          }
        }
      }
    if (this.alive() === 0 && this.phase !== "drop") this.endGame();
  }

  private animTile(t: Tile, dt: number) {
    const m = t.m;
    if (t.state === "solid") {
      let y = 0,
        sx = 1,
        ry = 0,
        mats = this.boxMats[t.c];
      if (this.phase === "flip") {
        const p = clamp((this.phaseT - t.delay) / 0.4, 0, 1);
        if (p > 0 && p < 1) {
          ry = p * (Math.PI / 2);
          sx = 1 + Math.sin(p * Math.PI) * 0.06;
          y = Math.sin(p * Math.PI) * 0.12;
        }
        if (p >= 0.5 && !t.swapped) {
          t.swapped = true;
          t.c = t.next;
        }
        mats = this.boxMats[t.c];
      } else if (this.phase === "call") {
        const left = this.callDur - this.phaseT;
        if (t.c === this.target) {
          y = Math.abs(Math.sin(this.t * 6)) * 0.05;
        } else if (left < 0.75) {
          m.position.x = t.x + Math.sin(this.t * 45 + t.z) * 0.06;
          y = -0.06;
          if (Math.floor(this.t * 10) % 2 === 0) mats = this.dimMats[t.c];
        }
      }
      if (this.phase !== "call") m.position.x = t.x;
      if (m.material !== mats) m.material = mats;
      m.position.y = -TH / 2 + y;
      m.rotation.set(0, ry, 0);
      m.scale.set(sx, 1, sx);
    } else if (t.state === "fall") {
      t.vy -= 24 * dt;
      t.y += t.vy * dt;
      m.position.y = -TH / 2 + t.y;
      m.rotation.x += t.spinX * dt;
      m.rotation.z += t.spinZ * dt;
      if (m.material !== this.boxMats[t.c]) m.material = this.boxMats[t.c];
      if (t.y < SEA_Y + 1) {
        t.state = "gone";
        m.visible = false;
        if ((t.x * 7 + t.z * 3) % 3 < 1) this.fx.splash({ x: t.x, y: SEA_Y + 0.3, z: t.z });
      }
    } else if (t.state === "rise") {
      const p = clamp((this.phaseT - t.delay) / 0.6, 0, 1);
      t.y = -10 + 10 * easeOutBack(p);
      m.position.set(t.x, -TH / 2 + t.y, t.z);
      m.rotation.set(0, 0, 0);
      m.scale.set(1, 1, 1);
      if (p >= 1) {
        t.state = "solid";
        t.y = 0;
      }
    }
  }

  private animWorld(dt: number) {
    this.seaTex.offset.x += dt * 0.01;
    this.seaTex.offset.y += dt * 0.006;
    // the sign settles after its pop, the balloons bob
    const s = this.signGroup.scale.x;
    this.signGroup.scale.setScalar(s + (1 - s) * (1 - Math.exp(-8 * dt)));
    this.signGroup.position.y = SIGN_Y + Math.sin(this.clock * 1.4) * 0.12;
    this.balloons.forEach((b, k) => (b.rotation.z = Math.sin(this.clock * 1.1 + k * 2) * 0.05));
    for (const g of this.gulls) {
      const a = this.clock * g.sp + g.ph;
      g.g.position.set(Math.cos(a) * g.r, g.h + Math.sin(a * 2) * 0.6, Math.sin(a) * g.r * 0.6 - 26);
      g.g.rotation.y = -a;
      const f = Math.sin(this.clock * 9 + g.ph) * 0.5;
      g.wl.rotation.z = f;
      g.wr.rotation.z = -f;
    }
    for (const b of this.airBalloons) {
      b.g.position.x = b.x0 + Math.sin(this.clock * 0.08 + b.ph) * 6;
      b.g.position.y += Math.sin(this.clock * 0.5 + b.ph) * dt * 0.3;
    }
    this.clock += dt;
  }
  private clock = 0;

  protected outroStep(dt: number) {
    this.animWorld(dt);
    // the camera closes in on the survivors (or the middle)
    const live = this.run.filter((r) => !r.out);
    const cx = live.length ? live.reduce((s, r) => s + r.x, 0) / live.length : 0;
    const cz = live.length ? live.reduce((s, r) => s + r.z, 0) / live.length : 0;
    this.moveCam([cx * 0.7, 8.5, cz + 10.5], [cx, 0.6, cz - 1], dt, 1.6);
    for (const t of this.tiles) if (t.state === "fall") this.animTile(t, dt);
    this.run.forEach((r, i) => {
      if (r.falling && !r.splashed) {
        r.vy -= 30 * dt;
        r.y += r.vy * dt;
        this.avatars[i].pos.y = r.y;
        if (r.y < SEA_Y + 0.5) {
          r.splashed = true;
          this.fx.splash({ x: r.x, y: SEA_Y + 0.3, z: r.z });
          this.avatars[i].setVisible(false);
        }
      } else if (!r.out) {
        this.avatars[i].face(0, dt, 6);
        if (Math.random() < dt * 1.5) this.fx.confetti({ x: r.x, y: 2.5, z: r.z }, 14);
      }
    });
  }

  dispose() {
    super.dispose();
    for (const t of this.ownTex) t.dispose();
    for (const m of this.signMats) m.dispose();
    this.signReady.dispose();
    for (const arr of [...this.boxMats, ...this.dimMats]) for (const m of arr) if (!(m.userData as { shared?: boolean }).shared) m.dispose();
    this.barMat.dispose();
  }
}

const def: MiniDef = {
  id: "couleur-express",
  name: "Color Call",
  icon: "🟦",
  color: "#2f8dff",
  tagline: "Run to the colour the block calls before the floor drops.",
  rules: "A colour is called: get onto a tile of it before the count ends, the rest falls into the sea! Hop into a rival to shove them. Last one standing wins.",
  controls: { stick: "Run", a: "Hop (shoves!)" },
  modes: ["ffa"],
  length: 45,
  music: "mini2",
  create: (ctx) => new CouleurExpress(ctx),
};
export default def;
