/**
 * TOUR DE CRÊPES (chacun pour soi, 30 s): four plates on the counter of a Parisian crêperie. Above
 * each player's stack a crêpe slides left and right; A drops it. What hangs over the edge of the
 * stack is cut off and falls away, a total miss loses the crêpe. Stacks grow, the camera rises.
 * 30 s or 12 crêpes each: the highest stack wins (ties: the widest top).
 */
import * as THREE from "three";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef } from "../types";
import { GEO, ball, blobShadow, box, canvasTex, cone, cyl, flat, group, toon, FONT_TITLE } from "../../engine/gfx";
import { clamp, damp } from "../../engine/util";
import { music } from "../../engine/audio";
import { T } from "../../../../i18n/lang";

const TIME = 30;
const MAXC = 12;
const SP = 3.9; // plate spacing
const CT = 1.0; // counter top
const PLATE_Y = CT + 0.08;
const R0 = 0.95; // crêpe radius
const TH = 0.17; // crêpe thickness
const AMP = 1.25; // slide amplitude
const HOVER = 1.15;
const GRAV = 22;
const PERFECT = 0.07;
/** A crêpe must rest on at least this much of the one below (else it slides off). */
const MIN_OVERLAP = 0.28;
/** The cooks stand on a step this high behind the counter. */
const STEP = 0.3;

interface Crepe {
  m: THREE.Mesh;
  x: number;
  r: number;
}
interface Falling {
  m: THREE.Mesh;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vr: number;
  life: number;
}
interface Stack {
  cx: number;
  crepes: Crepe[];
  /** The crêpe in play (sliding or dropping), null between two. */
  cur: THREE.Mesh | null;
  curR: number;
  phase: number;
  dir: number;
  x: number;
  y: number;
  vy: number;
  dropping: boolean;
  wait: number;
  used: number;
  shadow: THREE.Mesh;
  crown: THREE.Group;
  /** Little squash of the stack after a landing. */
  squash: number;
  cpuErr: number;
  cpuPrevX: number;
  spawnT: number;
  /** The cook's reaction (throw, joy, dismay) and how long it lasts. */
  react: "throw" | "win" | "stun" | null;
  reactT: number;
}

const TOPS = ["sucre", "chocolat", "fraise", "caramel", "banane"] as const;

function crepeTop(kind: (typeof TOPS)[number]) {
  return canvasTex(256, 256, (g, w, h) => {
    const c = w / 2;
    g.fillStyle = "#e9b665";
    g.fillRect(0, 0, w, h);
    // the lace of a crêpe: darker golden spots
    for (let i = 0; i < 160; i++) {
      const a = Math.random() * Math.PI * 2,
        r = Math.sqrt(Math.random()) * c;
      g.fillStyle = Math.random() < 0.5 ? "rgba(170,100,30,0.35)" : "rgba(255,230,170,0.35)";
      g.beginPath();
      g.arc(c + Math.cos(a) * r, c + Math.sin(a) * r, 3 + Math.random() * 9, 0, Math.PI * 2);
      g.fill();
    }
    g.lineCap = "round";
    if (kind === "sucre") {
      for (let i = 0; i < 260; i++) {
        const a = Math.random() * Math.PI * 2,
          r = Math.sqrt(Math.random()) * c * 0.8;
        g.fillStyle = "rgba(255,255,255,0.9)";
        g.fillRect(c + Math.cos(a) * r, c + Math.sin(a) * r, 3, 3);
      }
    } else if (kind === "chocolat" || kind === "caramel") {
      g.strokeStyle = kind === "chocolat" ? "#5a2e14" : "#c97a1e";
      g.lineWidth = 9;
      for (let k = 0; k < 6; k++) {
        g.beginPath();
        const y0 = 50 + k * 30;
        for (let x = 30; x <= w - 30; x += 8) g.lineTo(x, y0 + Math.sin(x * 0.07 + k) * 14);
        g.stroke();
      }
    } else if (kind === "fraise") {
      g.strokeStyle = "#d42a4a";
      g.lineWidth = 11;
      g.beginPath();
      for (let a = 0; a < Math.PI * 7; a += 0.1) g.lineTo(c + Math.cos(a) * a * 4.6, c + Math.sin(a) * a * 4.6);
      g.stroke();
    } else {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2,
          r = i % 2 ? 40 : 75;
        const x = c + Math.cos(a) * r,
          y = c + Math.sin(a) * r;
        g.fillStyle = "#fff3b8";
        g.beginPath();
        g.arc(x, y, 17, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#e0c86a";
        g.beginPath();
        g.arc(x, y, 5, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
}

class TourCrepes extends BaseMini {
  private stacks: Stack[] = [];
  private falling: Falling[] = [];
  private crepeGeo = new THREE.CylinderGeometry(1, 1, TH, 36);
  private mats: THREE.Material[][] = [];
  cardVals: HTMLElement[] = [];
  private camY = 0;
  private hurried = false;
  private over = false;
  private endIn = 0;
  private tieShown = false;
  private lampMat!: THREE.MeshBasicMaterial;

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#ffe7c4", "#ffd9a8"], size: 14, sun: [0.3, 1, 0.8], sunColor: "#fff1dc", hemi: ["#fff4e4", "#8a6a50", 1.7], fog: { near: 40, far: 90 } });
    // crêpe materials: golden side, a topping on top
    const side = toon("#d9984a");
    const bottom = toon("#c8843a");
    this.mats = TOPS.map((k) => [side, new THREE.MeshToonMaterial({ map: crepeTop(k) }), bottom]);
    this.buildCreperie();
    const n = this.players.length;
    this.players.forEach((p, i) => {
      const cx = (i - (n - 1) / 2) * SP;
      this.buildPlate(i, cx);
      // (on a step behind the counter: the zkSNARK's face shows over it)
      box(this.scene, "#7a4a2a", 1.0, STEP, 0.8, { x: cx + 1.75, y: STEP / 2, z: -1.55 });
      const a = this.spawn(i, cx + 1.75, -1.55, -0.25, { scale: 1.2 });
      a.pos.y = STEP;
      a.groundY = STEP;
      a.anim = "hold";
      const shadow = blobShadow(R0, 0.28);
      shadow.position.set(cx, PLATE_Y + 0.02, 0);
      this.scene.add(shadow);
      const crown = group(this.scene, {});
      ball(crown, "#fffdf6", [0.3, 0.2, 0.3], { y: 0.12 });
      ball(crown, "#fffdf6", [0.2, 0.16, 0.2], { y: 0.3 });
      cone(crown, "#fffdf6", 0.12, 0.2, { y: 0.46 });
      ball(crown, "#e8233f", 0.13, { x: 0.05, y: 0.58 });
      cyl(crown, "#3f8a2a", 0.015, 0.16, { x: 0.08, y: 0.72, rz: -0.4, seg: 4 });
      crown.visible = false;
      this.stacks.push({ cx, crepes: [], cur: null, curR: R0, phase: 0, dir: i % 2 ? -1 : 1, x: cx, y: 0, vy: 0, dropping: false, wait: 0.1 + i * 0.05, used: 0, shadow, crown, squash: 0, cpuErr: 0, cpuPrevX: cx, spawnT: 0, react: null, reactT: 0 });
    });
    const cards = this.hud.players(this.players, () => this.cardHtml(0, MAXC));
    this.cardVals = this.players.map((_, i) => cards.children[i]?.querySelector(".val") as HTMLElement);
    this.hud.timer(TIME);
    this.hud.tip(T(`<span class="key a">A</span> drops the pancake: aim for the top of your stack!`, `<span class="key a">A</span> 放下煎饼：对准你那叠的顶部！`));
    this.setCam([0, 5, 19], [0, 3, 0], 40);
  }

  private cardHtml(h: number, left: number, r = 0) {
    const sub = left > 0 || !h ? T(`${left} left`, `剩 ${left}`) : `⌀ ${Math.round(r * 40)} cm`;
    return `🥞 ${h} <span style="font-size:.45em;opacity:.8;font-family:var(--font);font-weight:700">${sub}</span>`;
  }

  // ------------------------------------------------------------ the crêperie

  private buildCreperie() {
    const s = this.scene;
    // chequered floor
    const tiles = canvasTex(256, 256, (g, w, h) => {
      const c = w / 4;
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 4; x++) {
          g.fillStyle = (x + y) % 2 ? "#2d2a36" : "#f2ece0";
          g.fillRect(x * c, y * c, c, c);
        }
    }, true);
    tiles.repeat.set(16, 8);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(64, 32), new THREE.MeshToonMaterial({ map: tiles }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, 4);
    floor.receiveShadow = true;
    s.add(floor);
    // back wall: white metro tiles, a dark wainscot
    const metro = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = "#d9d2c4";
      g.fillRect(0, 0, w, h);
      const tw = 64,
        th = 32;
      for (let y = 0; y < h / th; y++)
        for (let x = -1; x < w / tw + 1; x++) {
          const ox = (y % 2) * (tw / 2);
          g.fillStyle = "#fbf8f1";
          g.beginPath();
          g.roundRect(x * tw + ox + 2, y * th + 2, tw - 4, th - 4, 6);
          g.fill();
        }
    }, true);
    metro.repeat.set(10, 3);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(40, 12), new THREE.MeshToonMaterial({ map: metro }));
    wall.position.set(0, 6, -4.5);
    wall.receiveShadow = true;
    s.add(wall);
    box(s, "#1f4a3a", 40, 1.6, 0.2, { y: 0.8, z: -4.4 });
    box(s, "#c9a24a", 40, 0.1, 0.24, { y: 1.62, z: -4.38 });
    // the chalkboard menu
    const menu = canvasTex(512, 384, (g, w, h) => {
      g.fillStyle = "#6b4a2a";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#26302c";
      g.fillRect(16, 16, w - 32, h - 32);
      g.fillStyle = "#ffffff";
      g.textAlign = "center";
      // (the shop's name: the one sign no pendant lamp hides)
      g.font = `44px ${FONT_TITLE}`;
      g.fillText(T("ZSTREET PANCAKES", "ZSTREET 煎饼屋"), w / 2, 78);
      g.font = `30px ${FONT_TITLE}`;
      // (priced in the city's play money)
      const rows = [
        [T("Sugar", "砂糖"), "3 ⓩ"],
        [T("Chocolate", "巧克力"), "4 ⓩ"],
        [T("Jam", "果酱"), "4 ⓩ"],
        [T("Caramel", "焦糖"), "4.5 ⓩ"],
        [T("Shielded Banana", "屏蔽香蕉"), "5 ⓩ"],
      ];
      rows.forEach(([a, b], k) => {
        g.textAlign = "left";
        g.fillStyle = "#f4f0e0";
        g.fillText(a, 52, 140 + k * 44);
        g.textAlign = "right";
        g.fillStyle = "#ffd76a";
        g.fillText(b, w - 52, 140 + k * 44);
      });
    });
    const board = new THREE.Mesh(GEO.plane, new THREE.MeshToonMaterial({ map: menu }));
    board.scale.set(4, 3, 1);
    board.position.set(-7.2, 5.2, -4.35);
    s.add(board);
    // a window on a Paris street
    const view = canvasTex(512, 384, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, "#7cc6ff");
      gr.addColorStop(1, "#d8f0ff");
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
      for (let k = 0; k < 4; k++) {
        const x = k * 140 - 20;
        g.fillStyle = k % 2 ? "#efe1c4" : "#e6d2ae";
        g.fillRect(x, 90 + (k % 2) * 20, 130, h);
        g.fillStyle = "#6d7f96";
        g.fillRect(x - 4, 70 + (k % 2) * 20, 138, 30);
        g.fillStyle = "#4a5a7a";
        for (let fy = 0; fy < 4; fy++) for (let fx = 0; fx < 3; fx++) g.fillRect(x + 14 + fx * 40, 120 + (k % 2) * 20 + fy * 62, 22, 38);
      }
    });
    const win = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: view }));
    win.scale.set(5, 3.4, 1);
    win.position.set(6.8, 5.4, -4.4);
    s.add(win);
    for (const [w, h, x, y] of [
      [5.4, 0.25, 6.8, 7.2],
      [5.4, 0.25, 6.8, 3.6],
      [0.25, 3.8, 4.2, 5.4],
      [0.25, 3.8, 9.4, 5.4],
      [0.16, 3.4, 6.8, 5.4],
    ])
      box(s, "#1f4a3a", w, h, 0.2, { x, y, z: -4.3 });
    box(s, "#c94a3a", 5.6, 0.7, 0.5, { x: 6.8, y: 7.7, z: -4.1 });
    // a shelf of jars and a rail of copper pans
    box(s, "#7a4a2a", 5, 0.12, 0.5, { x: 0, y: 6.3, z: -4.2 });
    const jars = ["#d42a4a", "#ffb02e", "#5a2e14", "#ffe07a", "#8a3a8a", "#ff7a4a"];
    for (let k = 0; k < 6; k++) {
      cyl(s, flat(jars[k], 0.85), 0.24, 0.55, { x: -2 + k * 0.8, y: 6.64, z: -4.15, seg: 12, cast: false });
      cyl(s, "#f4f0e0", 0.26, 0.1, { x: -2 + k * 0.8, y: 6.96, z: -4.15, seg: 12, cast: false });
    }
    cyl(s, "#3a3a48", 0.04, 5.6, { x: 0, y: 5.6, z: -4.0, rz: Math.PI / 2, seg: 6 });
    for (let k = 0; k < 5; k++) {
      const x = -2 + k;
      const r = 0.3 + (k % 3) * 0.08;
      cyl(s, "#c8743a", r, 0.08, { x, y: 5.15 - r, z: -3.95, rx: Math.PI / 2, seg: 16, cast: false });
      box(s, "#7a4a2a", 0.06, 0.4, 0.04, { x, y: 5.4, z: -3.95, cast: false });
    }
    // pendant lamps
    this.lampMat = new THREE.MeshBasicMaterial({ color: "#fff2c2" });
    for (let k = 0; k < 4; k++) {
      const x = (k - 1.5) * SP;
      cyl(s, "#2d2d38", 0.02, 3.2, { x, y: 8.8, z: -0.4, seg: 4, cast: false });
      cone(s, "#1f4a3a", 0.55, 0.45, { x, y: 7.1, z: -0.4, cast: false });
      const b = new THREE.Mesh(GEO.sphereLo, this.lampMat);
      b.scale.setScalar(0.2);
      b.position.set(x, 6.82, -0.4);
      s.add(b);
    }
    // the counter: dark green with gold trim, a marble top, the name of the place
    const n = this.players.length;
    const L = n * SP + 2.6;
    box(s, "#1f4a3a", L, CT - 0.08, 2.2, { y: (CT - 0.08) / 2, z: 0 });
    box(s, "#f1ede6", L + 0.3, 0.12, 2.5, { y: CT - 0.04, z: 0 });
    box(s, "#c9a24a", L + 0.02, 0.07, 0.05, { y: CT - 0.16, z: 1.12 });
    box(s, "#c9a24a", L + 0.02, 0.07, 0.05, { y: 0.1, z: 1.12 });
    for (let k = 0; k <= n; k++) box(s, "#c9a24a", 0.07, CT - 0.3, 0.05, { x: -L / 2 + 0.1 + ((L - 0.2) / n) * k, y: CT / 2 - 0.03, z: 1.12 });
    // the back counter with two griddles
    box(s, "#7a4a2a", L, 0.9, 1.0, { y: 0.45, z: -3.7 });
    for (const x of [-4.5, 3.5]) {
      cyl(s, "#2d2d38", 0.75, 0.12, { x, y: 0.98, z: -3.6, seg: 24 });
      cyl(s, "#e9b665", 0.6, 0.02, { x, y: 1.05, z: -3.6, seg: 24 });
    }
  }

  private buildPlate(i: number, cx: number) {
    const s = this.scene;
    const p = this.players[i];
    cyl(s, "#ffffff", 1.2, 0.07, { x: cx, y: CT + 0.035, z: 0, seg: 32 });
    cyl(s, p.char.color, 1.22, 0.03, { x: cx, y: CT + 0.025, z: 0, seg: 32, cast: false });
    // a name plate on the counter front
    const col = p.char.color;
    const tex = canvasTex(384, 96, (g, w, h) => {
      g.fillStyle = col;
      g.beginPath();
      g.roundRect(0, 0, w, h, 40);
      g.fill();
      g.fillStyle = new THREE.Color(col).getHSL({ h: 0, s: 0, l: 0 }).l > 0.62 ? "#1d1630" : "#ffffff";
      g.font = `66px ${FONT_TITLE}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(p.name, w / 2, h / 2 + 4);
    });
    const plate = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    plate.scale.set(2.2, 0.55, 1);
    plate.position.set(cx, CT * 0.5, 1.13);
    s.add(plate);
  }

  // ------------------------------------------------------------ helpers

  private topY(st: Stack) {
    return PLATE_Y + st.crepes.length * TH;
  }
  private topOf(st: Stack): { x: number; r: number } {
    const c = st.crepes[st.crepes.length - 1];
    return c ? { x: c.x, r: c.r } : { x: st.cx, r: 1.2 };
  }

  private newCrepe(i: number) {
    const st = this.stacks[i];
    const m = new THREE.Mesh(this.crepeGeo, this.mats[Math.floor(this.rnd() * this.mats.length)]);
    m.castShadow = true;
    m.receiveShadow = true;
    this.scene.add(m);
    st.cur = m;
    st.curR = st.crepes.length ? st.crepes[st.crepes.length - 1].r : R0;
    st.dropping = false;
    st.phase = st.dir > 0 ? -1 : 1;
    st.dir = -st.dir;
    st.y = this.topY(st) + HOVER;
    st.vy = 0;
    st.spawnT = this.t;
    // CPU: where it will aim this time
    const lv = this.players[i].level;
    const g = (this.rnd() + this.rnd() + this.rnd() - 1.5) * 1.4;
    st.cpuErr = g * (0.2 - 0.17 * lv) * (0.55 + 0.45 * (this.speed(st) / 2.2));
    this.place(st);
    m.scale.set(0.01, 1, 0.01);
  }

  private speed(st: Stack) {
    return 2.2 + 0.3 * Math.min(st.crepes.length, st.used);
  }

  private place(st: Stack) {
    if (!st.cur) return;
    if (!st.dropping) st.x = st.cx + st.phase * AMP;
    st.cur.position.set(st.x, st.y, 0);
  }

  // ------------------------------------------------------------ CPUs

  protected cpu(i: number): CpuPad {
    const st = this.stacks[i];
    if (!st.cur || st.dropping || this.over) return {};
    const lv = this.players[i].level;
    if (this.t - st.spawnT < 0.35 + (1 - lv) * 0.4) {
      st.cpuPrevX = st.x;
      return {};
    }
    const target = this.topOf(st).x + st.cpuErr;
    const crossed = (st.cpuPrevX - target) * (st.x - target) <= 0 && st.cpuPrevX !== st.x;
    st.cpuPrevX = st.x;
    return { a: crossed };
  }

  // ------------------------------------------------------------ the game

  protected idle(dt: number) {
    this.moveCam([0, 3.6, 13], [0, 3.2, 0], dt, 1.5);
    this.avatars.forEach((a, i) => a.face(-0.25 + Math.sin(this.t + i) * 0.1, dt));
  }

  protected step(dt: number) {
    const left = TIME - this.t;
    this.hud.timer(left);
    if (this.t > 5) this.hud.tip(null);
    if (!this.hurried && left <= 10) {
      this.hurried = true;
      this.hud.banner(T("10 SECONDS LEFT!", "还剩 10 秒！"), { color: "#ffd23f" });
      music.speed(1.15);
      this.sound("bell");
    }

    let maxTop = PLATE_Y;
    this.stacks.forEach((st, i) => {
      const a = this.avatars[i];
      const p = this.pad(i);
      // the next crêpe
      if (!st.cur && !this.over && st.used < MAXC && left > 0) {
        st.wait -= dt;
        if (st.wait <= 0) this.newCrepe(i);
      }
      if (st.cur) {
        const m = st.cur;
        // pop-in
        const k = clamp((this.t - st.spawnT) / 0.18, 0, 1);
        m.scale.set(st.curR * k, 1, st.curR * k);
        if (!st.dropping) {
          // sliding: a triangle wave between -1 and 1
          st.phase += (st.dir * this.speed(st) * dt) / AMP;
          if (st.phase > 1) {
            st.phase = 2 - st.phase;
            st.dir = -1;
          } else if (st.phase < -1) {
            st.phase = -2 - st.phase;
            st.dir = 1;
          }
          st.y = damp(st.y, this.topY(st) + HOVER, 8, dt);
          m.rotation.z = Math.sin(this.t * 6 + i) * 0.04;
          if (p.aDown && !this.over) this.drop(i);
        } else {
          st.vy -= GRAV * dt;
          st.y += st.vy * dt;
          m.rotation.z *= 0.8;
          const land = this.topY(st) + TH / 2;
          if (st.y <= land) this.land(i);
        }
        this.place(st);
      }
      // the guide shadow on top of the stack
      const top = this.topY(st);
      st.shadow.visible = !!st.cur;
      if (st.cur) {
        st.shadow.position.set(st.x, top + 0.012, 0);
        st.shadow.scale.set(st.curR * 2, st.curR * 2, 1);
      }
      // the stack squashes a little on each landing, the cream rides on top
      st.squash = damp(st.squash, 0, 9, dt);
      st.crepes.forEach((c, k) => {
        c.m.position.y = PLATE_Y + TH * (k + 0.5) * (1 - st.squash * (k / Math.max(1, st.crepes.length)));
      });
      const last = st.crepes[st.crepes.length - 1];
      st.crown.visible = !!last;
      if (last) st.crown.position.set(last.x + last.r * 0.35, last.m.position.y + TH / 2, -0.1);
      maxTop = Math.max(maxTop, top);
      // the cook follows the crêpe with the eyes, and reacts
      st.reactT -= dt;
      a.anim = st.reactT > 0 && st.react ? st.react : "hold";
      a.face(clamp((st.x - a.pos.x) * 0.25, -0.8, 0.5), dt, 5);
    });

    // falling pieces
    for (const f of this.falling) {
      f.life -= dt;
      f.vy -= GRAV * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.z += 0.8 * dt;
      f.m.position.set(f.x, f.y, f.z);
      f.m.rotation.z += f.vr * dt;
      f.m.rotation.x += f.vr * 0.4 * dt;
      if (f.y < 0.1 || f.life <= 0) {
        if (f.y < 0.1) this.fx.dust({ x: f.x, y: 0.05, z: f.z }, 4, "#e9b665");
        f.m.removeFromParent();
        f.life = -1;
      }
    }
    this.falling = this.falling.filter((f) => f.life > 0);

    // the camera rises with the stacks
    this.camY = damp(this.camY, Math.max(0, maxTop - PLATE_Y - 1.2), 2, dt);
    this.moveCam([0, 3.6 + this.camY * 0.9, 13 + this.camY * 0.5], [0, 3.2 + this.camY * 0.85, 0], dt, 4);
    this.lampMat.color.setHSL(0.12, 1, 0.85 + Math.sin(this.t * 3) * 0.03);

    // the end
    const allDone = this.stacks.every((st) => st.used >= MAXC && !st.cur);
    if (!this.over && (left <= 0 || allDone)) {
      this.over = true;
      this.endIn = 1.0;
      for (const st of this.stacks) {
        if (st.cur && !st.dropping) {
          // the crêpes still in the air are lost
          this.falling.push({ m: st.cur, x: st.x, y: st.y, z: 0, vx: 0, vy: 2, vr: 4, life: 1.2 });
          st.cur = null;
        }
      }
      if (allDone && left > 0) this.hud.banner(T("ALL PANCAKES SERVED!", "煎饼全部上桌！"), { color: "#ffd23f", size: 5.5 });
    }
    if (this.over) {
      this.endIn -= dt;
      const busy = this.stacks.some((st) => st.cur && st.dropping);
      if (this.endIn <= 0 && !busy) {
        const hi = Math.max(...this.stacks.map((st) => st.crepes.length));
        if (!this.tieShown && hi > 0 && this.stacks.filter((st) => st.crepes.length === hi).length > 1) {
          // explain the tie-break before the end
          this.tieShown = true;
          this.endIn = 1.5;
          this.hud.banner(T("SAME HEIGHT!", "一样高！"), { color: "#ffd23f", size: 6, sub: T("The widest tower wins", "最宽的塔获胜"), ms: 1300 });
          this.sound("bell");
          return;
        }
        const scores = this.stacks.map((st) => st.crepes.length * 10 + (st.crepes.length ? st.crepes[st.crepes.length - 1].r : 0));
        this.finishByScore(scores);
      }
    }
  }

  private drop(i: number) {
    const st = this.stacks[i];
    st.dropping = true;
    st.vy = -1;
    st.used++;
    this.reactTo(i, "throw", 0.3);
    this.sound("whoosh");
    this.setCard(i);
  }

  private land(i: number) {
    const st = this.stacks[i];
    const m = st.cur!;
    const p = this.players[i];
    const top = this.topOf(st);
    const first = st.crepes.length === 0;
    const r = st.curR;
    const lo = Math.max(st.x - r, top.x - top.r);
    const hi = Math.min(st.x + r, top.x + top.r);
    const at = new THREE.Vector3(st.x, this.topY(st) + 0.4, 0);
    const a = this.avatars[i];
    const perfect = !first && Math.abs(st.x - top.x) < PERFECT;
    if (!perfect && (hi - lo < Math.min(MIN_OVERLAP, r * 1.6) || (first && Math.abs(st.x - st.cx) > 1.15))) {
      // missed: the whole crêpe falls off
      this.falling.push({ m, x: st.x, y: this.topY(st) + TH / 2, z: 0, vx: Math.sign(st.x - top.x || 1) * 2.4, vy: 1.5, vr: Math.sign(st.x - top.x || 1) * -5, life: 2 });
      st.cur = null;
      st.wait = 0.45;
      this.hud.pop(at, T("Missed!", "没放上！"), "#ff6a5a", this.camera);
      this.sound("wrong");
      this.reactTo(i, "stun", 0.8);
      a.flash();
      this.buzz(i, [60, 40, 60]);
      this.setCard(i);
      return;
    }
    let nx: number, nr: number;
    if (first) {
      nx = st.x;
      nr = r;
    } else if (perfect) {
      // perfect: snapped on, and a little bigger again
      nx = top.x;
      nr = Math.min(R0, r + 0.05);
      this.hud.pop(at, T("Perfect!", "完美！"), "#7dff7a", this.camera);
      this.fx.sparkle(at, "#fff6a8", 18);
      this.fx.ring(new THREE.Vector3(nx, this.topY(st) + TH, 0), "#ffffff", nr * 1.6, 0.4);
      this.sound("ding");
      this.buzz(i, 30);
      this.reactTo(i, "win", 0.5);
    } else {
      nx = (lo + hi) / 2;
      nr = (hi - lo) / 2;
      // the overhang falls away
      const cutW = 2 * r - (hi - lo);
      if (cutW > 0.03) {
        const side = st.x > top.x ? 1 : -1;
        const cx = side > 0 ? (hi + st.x + r) / 2 : (lo + st.x - r) / 2;
        const piece = new THREE.Mesh(this.crepeGeo, m.material);
        piece.scale.set(cutW / 2, 1, Math.min(r, cutW / 2 + 0.3));
        piece.castShadow = true;
        this.scene.add(piece);
        this.falling.push({ m: piece, x: cx, y: this.topY(st) + TH / 2, z: 0, vx: side * 1.8, vy: 1.2, vr: -side * 6, life: 2 });
        this.sound("slide");
      }
      this.sound("land");
    }
    m.scale.set(nr, 1, nr);
    m.rotation.set(0, this.rnd() * Math.PI, 0);
    m.position.set(nx, this.topY(st) + TH / 2, 0);
    st.crepes.push({ m, x: nx, r: nr });
    st.cur = null;
    st.wait = 0.3;
    st.squash = 0.35;
    this.fx.burst({ x: nx, y: this.topY(st), z: 0 }, { count: 6, colors: ["#fff3d0", "#e9b665"], speed: 2.4, up: 1, gravity: 6, size: 0.1, sizeEnd: 0, life: 0.4, shape: "ball", flat: true });
    this.sound("thud");
    this.setCard(i);
    const n = st.crepes.length;
    if (n === 8 || n === 11) this.hud.pop(new THREE.Vector3(st.cx, this.topY(st) + 1.2, 0), n === 8 ? T("Nice tower!", "好高的塔！") : T("Dizzy heights!", "高得眼晕！"), p.char.color, this.camera);
  }

  private reactTo(i: number, r: "throw" | "win" | "stun", t: number) {
    const st = this.stacks[i];
    st.react = r;
    st.reactT = t;
  }

  private setCard(i: number) {
    const st = this.stacks[i];
    const top = st.crepes[st.crepes.length - 1];
    this.hud.setScore(this.players[i].seat, this.cardHtml(st.crepes.length, MAXC - st.used, top ? top.r : 0));
  }

  protected celebrate(res: { place: number[] }) {
    super.celebrate(res);
    this.stacks.forEach((st, i) => {
      if (res.place[i] === 1) this.fx.confetti(new THREE.Vector3(st.cx, this.topY(st) + 1, 0.5), 60);
    });
  }

  protected outroStep(dt: number) {
    for (const f of this.falling) {
      f.vy -= GRAV * dt;
      f.y += f.vy * dt;
      f.x += f.vx * dt;
      f.m.position.set(f.x, f.y, f.z);
      if (f.y < -2) f.m.visible = false;
    }
  }

  dispose() {
    super.dispose();
    this.crepeGeo.dispose();
    for (const ms of this.mats) (ms[1] as THREE.MeshToonMaterial).map?.dispose(), ms[1].dispose();
  }
}

const def: MiniDef = {
  id: "tour-crepes",
  name: "Pancake Tower",
  icon: "🥞",
  color: "#ffb347",
  tagline: "Stack the pancakes straight; tallest tower wins.",
  rules: "A pancake slides over your stack: A drops it. What sticks out is cut off; one beside the stack is lost! 12 pancakes, 30 s: the tallest tower wins.",
  controls: { a: "Drop the pancake" },
  modes: ["ffa"],
  length: 30,
  music: "paris",
  create: (ctx) => new TourCrepes(ctx),
};
export default def;
