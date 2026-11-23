/**
 * BONNETEAU (chacun pour soi, 3 manches): on a street-market table, a moustachioed host in a
 * striped shirt hides a gold star under one cup and shuffles the cups (3, then 4, then 5), faster
 * every round, with arcs and double swaps. Then everyone secretly HOLDS the stick toward a cup
 * (each cup shows the direction that picks it): when the 5 s run out the choices are locked and
 * revealed together. Right cup = +1 star. Most stars after 3 rounds wins (ties share).
 */
import * as THREE from "three";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef } from "../types";
import { GEO, ball, box, canvasTex, coinMesh, cyl, flat, group, toon, tree } from "../../engine/gfx";
import { clamp, easeInOutCubic, easeOutBack, lerp } from "../../engine/util";
import { COIN } from "../../engine/hud";
import { portrait } from "../../engine/chars3d";
import { music } from "../../engine/audio";
import { T } from "../../../../i18n/lang";

const ROUNDS = [
  { n: 3, moves: 8, dur: 0.62, doubles: 0 },
  { n: 4, moves: 10, dur: 0.48, doubles: 0.2 },
  { n: 5, moves: 13, dur: 0.37, doubles: 0.35 },
];
const CHOOSE = 5;
const TABLE_Y = 1.05;
const CUP_Z = 0.35;
const GAP = 1.75;
const CUP_H = 1.15;

interface Cup {
  g: THREE.Group;
  slot: number;
  x: number;
  z: number;
  y: number;
  /** Pop-in scale. */
  s: number;
  lift: number;
}
interface Move {
  pairs: [number, number][];
  dur: number;
}

/** The host's patter, [English, Chinese]. */
const HOST_LINES: Record<"show" | "shuffle" | "choose" | "win" | "lose", [string, string][]> = {
  show: [
    ["Step right up!", "快来看，快来看！"],
    ["Watch the shielded note…", "盯紧这张屏蔽票据……"],
    ["Eyes wide open!", "睁大眼睛！"],
  ],
  shuffle: [
    ["Hop, hop, hop!", "嘿，嘿，嘿！"],
    ["Round and round!", "转起来啦！"],
    ["Faster!", "再快点！"],
    ["Follow the hand!", "盯住我的手！"],
  ],
  choose: [
    ["So, where is it?", "那么，它在哪儿？"],
    ["Place your bets!", "请下注！"],
    ["Think hard…", "好好想想……"],
  ],
  win: [
    ["Well spotted!", "眼力真好！"],
    ["Bravo, champions!", "厉害，冠军们！"],
    ["Not bad at all!", "相当不错！"],
  ],
  lose: [
    ["Heh heh… Missed!", "嘿嘿……没猜中！"],
    ["Too fast for you!", "对你们来说太快啦！"],
    ["The hand beats the eye!", "手比眼睛快！"],
  ],
};

class Bonneteau extends BaseMini {
  private round = -1;
  private phase: "wait" | "show" | "shuffle" | "choose" | "reveal" | "done" = "wait";
  private pt = 0;
  private cups: Cup[] = [];
  private starCup = 0;
  /** The prize under the cup: a shielded note, a gold ⓩ coin. */
  private star!: THREE.Object3D;
  private starGlow!: THREE.Mesh;
  private moves: Move[] = [];
  private moveI = 0;
  private moveT = 0;
  private host!: THREE.Group;
  private hostHead!: THREE.Group;
  private hands: THREE.Group[] = [];
  private handPos = [new THREE.Vector3(-1.6, 2.2, -0.6), new THREE.Vector3(1.6, 2.2, -0.6)];
  private bubble: HTMLElement | null = null;
  private bubbleT = 0;
  private scores: number[] = [];
  private lastDir: (number | null)[] = [];
  private choice: number[] = [];
  private cpuPick: number[] = [];
  private cpuHold: number[] = [];
  private qLabels: (HTMLElement | null)[] = [];
  private arrowLabels: HTMLElement[] = [];
  private pickLabels: HTMLElement[] = [];
  private anchors: THREE.Object3D[] = [];
  private cupGeo: THREE.CylinderGeometry;
  private cupMat = toon("#d8402c");
  private bandMat = toon("#fff4dc");
  private lastTick = -1;
  private drumT = 0;

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#5fb4ff", "#ffe9c4"], size: 12, sun: [0.45, 1, 0.6], fog: { near: 35, far: 80 } });
    this.cupGeo = new THREE.CylinderGeometry(0.4, 0.6, CUP_H, 28, 1, true);
    this.buildMarket();
    this.buildTable();
    this.buildHost();
    // the shielded note (a ⓩ coin hidden under a cup)
    this.star = coinMesh(0.34);
    this.star.position.y = TABLE_Y + 0.42;
    this.scene.add(this.star);
    this.starGlow = new THREE.Mesh(new THREE.CircleGeometry(0.7, 32), flat("#fff2a0", 0.55, true));
    this.starGlow.rotation.x = -Math.PI / 2;
    this.scene.add(this.starGlow);
    // players around the table ends, two on each side
    const spots = [
      [-5.9, 0.1],
      [5.9, 0.1],
      [-4.5, 3.3],
      [4.5, 3.3],
    ];
    this.players.forEach((p, i) => {
      const [x, z] = spots[i];
      const a = this.spawn(i, x, z, Math.atan2(-x, CUP_Z - z));
      a.setRing(p.char.color);
      this.scores.push(0);
      this.lastDir.push(null);
      this.choice.push(-1);
      this.cpuPick.push(0);
      this.cpuHold.push(0);
      this.qLabels.push(null);
    });
    this.hud.add(
      `<style>
      .bn-bubble{background:#fff!important;color:#1d1630!important;text-shadow:none!important;font-family:var(--title);font-size:calc(var(--u)*1.9)!important;padding:calc(var(--u)*0.6) calc(var(--u)*1.4)!important;border:calc(var(--u)*0.3) solid #1d1630;border-radius:calc(var(--u)*2)!important;box-shadow:0 calc(var(--u)*0.4) 0 rgba(0,0,0,.25)}
      .bn-bubble:after{content:"";position:absolute;left:calc(var(--u)*-1.5);bottom:calc(var(--u)*0.5);border-top:calc(var(--u)*0.7) solid transparent;border-bottom:calc(var(--u)*0.7) solid transparent;border-right:calc(var(--u)*1.3) solid #1d1630}
      .bn-q{background:rgba(20,14,40,.82)!important;font-family:var(--title);font-size:calc(var(--u)*2.2)!important;min-width:calc(var(--u)*3.6);text-align:center;border:calc(var(--u)*0.25) solid var(--lc2,#fff)}
      .bn-q.ok{background:#2fbf5a!important}
      .bn-arrow{background:transparent!important;padding:0!important}
      .bn-arrow .c{width:calc(var(--u)*4.4);height:calc(var(--u)*4.4);border-radius:50%;background:#1d1630;border:calc(var(--u)*0.35) solid #fff;display:grid;place-items:center;box-shadow:0 calc(var(--u)*0.35) 0 rgba(0,0,0,.3)}
      .bn-arrow svg{width:72%;height:72%}
      .bn-picks{background:transparent!important;padding:0!important;display:flex;gap:calc(var(--u)*0.3)}
      .bn-picks .p{width:calc(var(--u)*3.8);height:calc(var(--u)*3.8);border-radius:50%;background:var(--pc) center/120% no-repeat;background-position:50% 30%;border:calc(var(--u)*0.35) solid #fff;box-shadow:0 0 0 calc(var(--u)*0.25) var(--pc),0 calc(var(--u)*0.4) 0 rgba(0,0,0,.3);animation:bnpop .35s cubic-bezier(.2,1.6,.4,1)}
      @keyframes bnpop{0%{transform:scale(.1)}100%{transform:scale(1)}}
      </style>`,
    );
    this.hud.players(this.players, () => `${COIN} 0`);
    this.setCam([0, 16, 24], [0, 1, 0], 40);
    this.makeCups(3);
    this.say(T("Step right up!", "快来看，快来看！"), 99);
  }

  // ------------------------------------------------------------ decor

  private buildMarket() {
    const s = this.scene;
    // cobblestones
    const cob = canvasTex(
      512,
      512,
      (g, w) => {
        g.fillStyle = "#8f8478";
        g.fillRect(0, 0, w, w);
        const cols = ["#b9ab98", "#c8bba6", "#a89a88", "#d2c6b2", "#b2a48f"];
        for (let y = 0; y < 8; y++)
          for (let x = 0; x < 8; x++) {
            const ox = (y % 2) * 32;
            g.fillStyle = cols[(x * 3 + y * 7) % cols.length];
            g.beginPath();
            g.roundRect(x * 64 + ox + 4, y * 64 + 4, 56, 56, 14);
            g.fill();
          }
      },
      true,
    );
    cob.repeat.set(14, 14);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshToonMaterial({ map: cob }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    s.add(ground);
    // a rug of light under the table
    const rug = new THREE.Mesh(new THREE.CircleGeometry(7.6, 48), toon("#c98d5a"));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.01, 0.5);
    rug.receiveShadow = true;
    s.add(rug);
    const rug2 = new THREE.Mesh(new THREE.RingGeometry(7.1, 7.5, 48), toon("#f2d27a"));
    rug2.rotation.x = -Math.PI / 2;
    rug2.position.set(0, 0.02, 0.5);
    s.add(rug2);

    // the host's stall behind: posts, a striped awning, crates of fruit
    const stall = group(s, { z: -5.2 });
    for (const x of [-5.4, 5.4]) cyl(stall, "#7a4a2a", 0.14, 4.6, { x, y: 2.3, seg: 8 });
    const stripes = canvasTex(512, 64, (g, w, h) => {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? "#fff6e8" : "#e8412f";
        g.fillRect((i * w) / 8, 0, w / 8, h);
      }
      g.fillStyle = "rgba(0,0,0,0.12)";
      g.fillRect(0, h - 8, w, 8);
    });
    const awning = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.12, 3), [toon("#c8301f"), toon("#c8301f"), new THREE.MeshToonMaterial({ map: stripes }), toon("#c8301f"), toon("#c8301f"), toon("#c8301f")]);
    awning.position.set(0, 4.55, 0.9);
    awning.rotation.x = 0.28;
    awning.castShadow = true;
    stall.add(awning);
    // scalloped edge
    for (let i = 0; i < 12; i++) ball(stall, i % 2 ? "#fff6e8" : "#e8412f", [0.5, 0.28, 0.12], { x: -5.25 + i * 0.955, y: 4.1, z: 2.35, lo: true, cast: false });
    box(stall, "#a8703f", 10.4, 1.3, 1.4, { y: 0.65, z: -0.4 });
    box(stall, "#8a5a32", 10.8, 0.15, 1.6, { y: 1.35, z: -0.4 });
    // fruit crates (instanced fruit)
    const fruitCols = ["#ff8a1e", "#e8302f", "#ffd84a", "#7fd14a", "#9b4ad8"];
    const crates: [number, number][] = [];
    for (let k = 0; k < 5; k++) {
      const x = -4.2 + k * 2.1;
      box(stall, "#c9925a", 1.8, 0.5, 1.2, { x, y: 1.68, z: -0.4 });
      crates.push([x, k]);
    }
    const fruits = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 10, 8), toon("#ffffff"), 5 * 15);
    const m4 = new THREE.Matrix4();
    let n = 0;
    for (const [x, k] of crates)
      for (let a = 0; a < 5; a++)
        for (let b = 0; b < 3; b++) {
          m4.makeTranslation(x - 0.64 + a * 0.32, 2.0 + ((a + b) % 2) * 0.06, -0.75 + b * 0.34);
          fruits.setMatrixAt(n, m4);
          fruits.setColorAt(n, new THREE.Color(fruitCols[k]));
          n++;
        }
    fruits.position.copy(stall.position);
    fruits.castShadow = true;
    s.add(fruits);
    // price sign
    const sign = canvasTex(256, 128, (g, w, h) => {
      g.fillStyle = "#2a2a2a";
      g.beginPath();
      g.roundRect(0, 0, w, h, 18);
      g.fill();
      g.fillStyle = "#fff";
      g.font = 'bold 54px "Lilita One", sans-serif';
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("1 ZEC", w / 2, h / 2 + 4);
    });
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), new THREE.MeshBasicMaterial({ map: sign }));
    sg.position.set(3.2, 2.7, -4.8);
    s.add(sg);

    // bunting across the square (one mesh)
    const pos: number[] = [];
    const col: number[] = [];
    const flagCols = ["#ff4b3e", "#ffd23f", "#2f8dff", "#3fcf5a", "#ff7ad9", "#ffffff"].map((c) => new THREE.Color(c));
    const line = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, count: number, off: number) => {
      for (let i = 0; i < count; i++) {
        const t0 = (i + 0.1) / count,
          t1 = (i + 0.9) / count,
          tm = (i + 0.5) / count;
        const P = (t: number) => [lerp(ax, bx, t), lerp(ay, by, t) - Math.sin(t * Math.PI) * 1.1, lerp(az, bz, t)];
        const p0 = P(t0),
          p1 = P(t1),
          pm = P(tm);
        pos.push(...p0, ...p1, pm[0], pm[1] - 0.6, pm[2]);
        const c = flagCols[(i + off) % flagCols.length];
        for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
      }
    };
    line(-11, 7, -6, 11, 7, -6, 16, 0);
    line(-11, 7.5, -12, -9, 6.5, 6, 12, 2);
    line(11, 7.5, -12, 9, 6.5, 6, 12, 4);
    const bg = new THREE.BufferGeometry();
    bg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    bg.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    s.add(new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));
    for (const [x, z] of [
      [-11, -6],
      [11, -6],
      [-11, -12],
      [11, -12],
      [-9, 6],
      [9, 6],
    ]) {
      cyl(s, "#3a3a48", 0.1, 7.4, { x, y: 3.7, z, seg: 8 });
      ball(s, toon("#fff3b0", "#ffcc33", 0.8), 0.25, { x, y: 7.5, z });
    }

    // façades all around the back
    const facade = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = "#f3e2c4";
      g.fillRect(0, 0, w, h);
      for (let y = 0; y < 3; y++)
        for (let x = 0; x < 3; x++) {
          g.fillStyle = "#4a6a8a";
          g.fillRect(28 + x * 76, 40 + y * 72, 46, 52);
          g.fillStyle = "#2a8a6a";
          g.fillRect(20 + x * 76, 40 + y * 72, 8, 52);
          g.fillRect(74 + x * 76, 40 + y * 72, 8, 52);
          g.fillStyle = "#6a5a4a";
          g.fillRect(24 + x * 76, 92 + y * 72, 54, 6);
        }
    });
    const facMat = new THREE.MeshToonMaterial({ map: facade });
    const tints = ["#ffffff", "#ffd9c0", "#e0f0ff", "#fff0b8", "#ffd0dc"];
    for (let i = 0; i < 9; i++) {
      const x = -24 + i * 6;
      const h = 8 + ((i * 5) % 4);
      const m = facMat.clone();
      m.color.set(tints[i % tints.length]);
      const b = new THREE.Mesh(GEO.box, [toon("#e0caa4"), toon("#e0caa4"), toon("#6d7f96"), toon("#e0caa4"), m, toon("#e0caa4")]);
      b.scale.set(6, h, 4);
      b.position.set(x, h / 2, -15 - (i % 2));
      s.add(b);
      box(s, i % 2 ? "#6d7f96" : "#b4583a", 6.3, 1.2, 4.3, { x, y: h + 0.5, z: -15 - (i % 2), cast: false });
    }
    for (const [x, z] of [
      [-14, -7],
      [14, -7],
      [-15, 3],
      [15, 3],
    ])
      tree(s, x, z, 1.6, "#5cc44f");
    // a few props near the table
    for (const [x, z, c] of [
      [-8.5, -2.5, "#8a5a32"],
      [8.6, -2.2, "#8a5a32"],
    ] as const) {
      cyl(s, c, 0.55, 1.2, { x, y: 0.6, z, seg: 16 });
      cyl(s, "#5a3a20", 0.58, 0.08, { x, y: 0.3, z, seg: 16 });
      cyl(s, "#5a3a20", 0.58, 0.08, { x, y: 0.95, z, seg: 16 });
    }
    box(s, "#c9925a", 1.1, 0.8, 1.1, { x: -9.4, y: 0.4, z: -0.8, ry: 0.3 });
    box(s, "#c9925a", 1.0, 0.7, 1.0, { x: 9.6, y: 0.35, z: -0.4, ry: -0.4 });
  }

  private buildTable() {
    const s = this.scene;
    const t = group(s);
    // green felt top and a red skirt with gold trim
    box(t, "#2f9a5a", 9.4, 0.18, 3.6, { y: TABLE_Y - 0.09, z: 0.3 });
    box(t, "#b8262e", 9.5, 0.75, 3.7, { y: TABLE_Y - 0.5, z: 0.3 });
    box(t, "#ffc928", 9.6, 0.1, 3.8, { y: TABLE_Y - 0.86, z: 0.3, cast: false });
    box(t, "#ffc928", 9.56, 0.08, 3.76, { y: TABLE_Y - 0.12, z: 0.3, cast: false });
    for (const x of [-4.4, 4.4]) for (const z of [-1.3, 1.9]) cyl(t, "#6a3e22", 0.12, TABLE_Y - 0.6, { x, y: (TABLE_Y - 0.6) / 2, z, seg: 8 });
    // the felt's painted oval
    const ov = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 48), flat("#6fd08a", 0.6));
    ov.rotation.x = -Math.PI / 2;
    ov.scale.set(4.4, 1.6, 1);
    ov.position.set(0, TABLE_Y + 0.005, CUP_Z);
    s.add(ov);
  }

  private buildHost() {
    const g = group(this.scene, { z: -2.3 });
    this.host = g;
    const shirtTex = canvasTex(64, 128, (c, w, h) => {
      for (let i = 0; i < 12; i++) {
        c.fillStyle = i % 2 ? "#ffffff" : "#1f3f8f";
        c.fillRect(0, (i * h) / 12, w, h / 12);
      }
    });
    const shirt = new THREE.MeshToonMaterial({ map: shirtTex });
    box(g, "#2a2a3a", 0.9, 1.2, 0.6, { y: 0.6 });
    ball(g, shirt, [0.95, 1.0, 0.75], { y: 1.85 });
    const head = group(g, { y: 3.0 });
    this.hostHead = head;
    const skin = "#ffcfa8";
    ball(head, skin, 0.6);
    ball(head, "#ff9a8a", 0.18, { y: -0.05, z: 0.58 });
    for (const sx of [-1, 1]) {
      ball(head, "#ffffff", 0.14, { x: sx * 0.22, y: 0.14, z: 0.5 });
      ball(head, "#1d1630", 0.075, { x: sx * 0.22, y: 0.14, z: 0.62, cast: false });
      box(head, "#3a2418", 0.26, 0.07, 0.08, { x: sx * 0.23, y: 0.36, z: 0.52, rz: sx * -0.25, cast: false });
      // curly moustache
      const m = ball(head, "#3a2418", [0.3, 0.1, 0.12], { x: sx * 0.22, y: -0.22, z: 0.56, rz: sx * 0.35 });
      m.castShadow = false;
      ball(head, "#3a2418", 0.09, { x: sx * 0.48, y: -0.08, z: 0.5, cast: false });
      ball(head, skin, 0.14, { x: sx * 0.6, y: 0, z: 0 });
    }
    ball(head, "#c23a3a", [0.16, 0.06, 0.06], { y: -0.36, z: 0.52, cast: false });
    // beret
    ball(head, "#1d1d2a", [0.66, 0.2, 0.66], { y: 0.5, rz: -0.2, x: -0.05 });
    cyl(head, "#1d1d2a", 0.04, 0.16, { y: 0.72, x: -0.1, seg: 6 });
    // red scarf
    const sc = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.12, 8, 20), toon("#e8302f"));
    sc.rotation.x = Math.PI / 2;
    sc.position.y = 2.55;
    g.add(sc);
    ball(g, "#e8302f", [0.14, 0.3, 0.08], { x: 0.25, y: 2.25, z: 0.45, rz: 0.4 });
    // floating white gloves
    for (let k = 0; k < 2; k++) {
      const hgrp = group(this.scene);
      ball(hgrp, "#ffffff", [0.34, 0.26, 0.38]);
      ball(hgrp, "#ffffff", 0.14, { x: k ? -0.3 : 0.3, y: 0.08, z: 0.08 });
      cyl(hgrp, "#e8302f", 0.2, 0.14, { y: 0.22, seg: 12 });
      this.hands.push(hgrp);
    }
  }

  // ------------------------------------------------------------ cups

  private slotX(slot: number, n: number) {
    return (slot - (n - 1) / 2) * GAP;
  }

  private makeCups(n: number) {
    for (const c of this.cups) c.g.removeFromParent();
    for (const a of this.anchors) a.removeFromParent();
    this.cups = [];
    this.anchors = [];
    for (let k = 0; k < n; k++) {
      const g = group(this.scene);
      const body = new THREE.Mesh(this.cupGeo, this.cupMat);
      body.position.y = CUP_H / 2;
      body.castShadow = true;
      g.add(body);
      cyl(g, this.bandMat, 0.575, 0.14, { y: 0.16, seg: 28 });
      cyl(g, this.bandMat, 0.43, 0.1, { y: CUP_H - 0.12, seg: 28 });
      cyl(g, this.cupMat, 0.4, 0.06, { y: CUP_H, seg: 28 });
      ball(g, "#ffc928", 0.13, { y: CUP_H + 0.08 });
      const x = this.slotX(k, n);
      const c: Cup = { g, slot: k, x, z: CUP_Z, y: 0, s: 0, lift: 0 };
      this.cups.push(c);
      const anchor = new THREE.Object3D();
      anchor.position.y = CUP_H;
      g.add(anchor);
      this.anchors.push(anchor);
    }
  }

  private placeCups(dt: number) {
    for (const c of this.cups) {
      c.s = Math.min(1, c.s + dt * 3);
      const k = easeOutBack(c.s);
      c.g.scale.setScalar(Math.max(0.01, k));
      c.g.position.set(c.x, TABLE_Y + c.y + c.lift, c.z);
    }
    const sc = this.cups[this.starCup];
    if (sc) {
      this.star.position.set(sc.x, TABLE_Y + 0.42 + Math.max(0, sc.lift - 0.3) * 0.45, sc.z);
      this.starGlow.position.set(sc.x, TABLE_Y + 0.01, sc.z);
      const shown = sc.lift > 0.25;
      this.star.visible = shown || this.cups.length === 0;
      this.star.scale.setScalar(1 + clamp(sc.lift - 0.3, 0, 1) * 0.6);
      this.starGlow.visible = shown;
    }
  }

  private planMoves(r: number) {
    const R = ROUNDS[r];
    this.moves = [];
    let dur = R.dur * 1.15;
    for (let m = 0; m < R.moves; m++) {
      const pairs: [number, number][] = [];
      const a = Math.floor(this.rnd() * R.n);
      let b = a;
      // mostly neighbours, sometimes a long cross
      const far = this.rnd() < 0.3;
      while (b === a) b = far ? Math.floor(this.rnd() * R.n) : clamp(a + (this.rnd() < 0.5 ? -1 : 1), 0, R.n - 1);
      pairs.push([a, b]);
      if (R.n >= 4 && this.rnd() < R.doubles) {
        const free = [...Array(R.n).keys()].filter((k) => k !== a && k !== b);
        if (free.length >= 2) {
          const c = free[Math.floor(this.rnd() * free.length)];
          let d = c;
          while (d === c) d = free[Math.floor(this.rnd() * free.length)];
          pairs.push([c, d]);
        }
      }
      this.moves.push({ pairs, dur });
      dur *= 0.94;
    }
  }

  // ------------------------------------------------------------ host

  private say(text: string, sec = 1.8) {
    if (!this.bubble) {
      // beside the head, clear of the timer
      const anchor = new THREE.Object3D();
      anchor.position.set(2.3, 0.2, 0);
      this.hostHead.add(anchor);
      this.bubble = this.hud.label(anchor, "", { dy: 0, cls: "bn-bubble" });
    }
    this.bubble.innerHTML = text;
    this.bubble.style.opacity = "1";
    this.bubbleT = sec;
  }
  private sayOne(list: [string, string][], sec = 1.8) {
    const [en, zh] = list[Math.floor(Math.random() * list.length)];
    this.say(T(en, zh), sec);
  }

  private animHost(dt: number) {
    const t = this.t + this.pt;
    this.host.position.y = Math.abs(Math.sin(t * 3)) * 0.05;
    this.hostHead.rotation.z = Math.sin(t * 1.7) * 0.08;
    this.hostHead.rotation.y = Math.sin(t * 0.9) * 0.15;
    // hands: over the moving cups during the shuffle, else rubbing / waving
    const targets: THREE.Vector3[] = [];
    if (this.phase === "shuffle" && this.moveI < this.moves.length) {
      const list = this.movers();
      list.sort((a, b) => a.x - b.x);
      for (let k = 0; k < 2; k++) {
        const c = list[k === 0 ? 0 : list.length - 1];
        if (c) targets.push(new THREE.Vector3(c.x, TABLE_Y + c.y + CUP_H + 0.28, c.z));
      }
    } else if (this.phase === "show" || this.phase === "reveal") {
      const c = this.cups[this.starCup];
      if (c) targets.push(new THREE.Vector3(c.x + 0.15, TABLE_Y + c.y + c.lift + CUP_H + 0.28, c.z), new THREE.Vector3(c.x < 0 ? 2.2 : -2.2, 2.6 + Math.sin(t * 8) * 0.25, -1.0));
    } else {
      targets.push(new THREE.Vector3(-0.45 + Math.sin(t * 9) * 0.1, 2.1, -1.4), new THREE.Vector3(0.45 - Math.sin(t * 9) * 0.1, 2.1, -1.4));
    }
    while (targets.length < 2) targets.push(new THREE.Vector3(1.6, 2.2, -1.2));
    targets.sort((a, b) => a.x - b.x);
    for (let k = 0; k < 2; k++) {
      const p = this.handPos[k];
      const r = 1 - Math.exp(-18 * dt);
      p.lerp(targets[k], r);
      this.hands[k].position.copy(p);
      this.hands[k].rotation.z = (k ? -1 : 1) * 0.3;
    }
    if (this.bubbleT > 0) {
      this.bubbleT -= dt;
      if (this.bubbleT <= 0 && this.bubble) this.bubble.style.opacity = "0";
    }
  }

  /** The cups of the move being played (their slots only change once it ends). */
  private movers(): Cup[] {
    const mv = this.moves[this.moveI];
    if (this.phase !== "shuffle" || !mv) return [];
    const slots = mv.pairs.flat();
    return this.cups.filter((c) => slots.includes(c.slot));
  }

  // ------------------------------------------------------------ rounds

  private startRound() {
    this.round++;
    const R = ROUNDS[this.round];
    this.makeCups(R.n);
    this.starCup = Math.floor(this.rnd() * R.n);
    this.planMoves(this.round);
    this.phase = "show";
    this.pt = 0;
    this.hud.banner(T(`ROUND ${this.round + 1} / 3`, `第 ${this.round + 1} / 3 回合`), { color: "#ffd23f", sub: T(`${R.n} cups`, `${R.n} 个杯子`) });
    this.sound("bell");
    this.sayOne(HOST_LINES.show, 2);
    if (this.round === 2) music.speed(1.12);
  }

  start() {
    this.startRound();
  }

  protected idle(dt: number) {
    this.moveCam([0, 7.9, 11.4], [0, 1.5, 0.6], dt, 1.5);
    this.placeCups(dt);
    this.animHost(dt);
    this.pt += dt;
    for (const c of this.cups) c.lift = 0;
  }

  protected cpu(i: number): CpuPad {
    if (this.phase !== "choose") return {};
    if (this.pt < this.cpuHold[i]) return {};
    const n = this.cups.length;
    const k = this.cpuPick[i];
    const th = Math.PI - (k * Math.PI) / (n - 1);
    return { x: Math.cos(th), y: -Math.sin(th) };
  }

  /** The cup a held stick points at (semicircle from ← to →), or null. */
  private dirToCup(x: number, y: number, n: number): number | null {
    if (Math.hypot(x, y) < 0.45) return null;
    let th = Math.atan2(-y, x);
    if (th < 0) {
      if (Math.abs(x) < 0.3) return null;
      th = x > 0 ? 0 : Math.PI;
    }
    return clamp(Math.round(((Math.PI - th) / Math.PI) * (n - 1)), 0, n - 1);
  }

  protected step(dt: number) {
    this.pt += dt;
    this.moveCam(this.phase === "reveal" ? [0, 7.2, 10.4] : [0, 7.9, 11.4], [0, 1.5, 0.6], dt, 2);
    this.animHost(dt);
    const R = ROUNDS[this.round];
    switch (this.phase) {
      case "show": {
        const c = this.cups[this.starCup];
        // lift the star cup, hold, put it back
        const t = this.pt;
        c.lift = t < 0.6 ? easeOutBack(clamp((t - 0.1) / 0.5, 0, 1)) * 1.5 : t < 1.8 ? 1.5 : 1.5 * (1 - easeInOutCubic(clamp((t - 1.8) / 0.4, 0, 1)));
        this.star.rotation.y += dt * 4;
        if (t > 0.35 && t - dt <= 0.35) {
          this.fx.sparkle({ x: c.x, y: TABLE_Y + 0.6, z: c.z }, "#ffe14a", 18);
          this.sound("star");
        }
        if (t > 2.2 && t - dt <= 2.2) this.sound("thud");
        if (t > 2.6) {
          this.star.rotation.y = 0;
          this.phase = "shuffle";
          this.pt = 0;
          this.moveI = 0;
          this.moveT = 0;
          this.sayOne(HOST_LINES.shuffle, 1.5);
        }
        break;
      }
      case "shuffle": {
        if (this.moveI >= this.moves.length) {
          if (this.pt > 0.5) this.beginChoose();
          break;
        }
        const mv = this.moves[this.moveI];
        if (this.moveT === 0) {
          this.sound(mv.pairs.length > 1 ? "swing" : "whoosh");
          if (this.moveI === Math.floor(this.moves.length / 2)) this.sayOne(HOST_LINES.shuffle, 1.2);
        }
        this.moveT += dt / mv.dur;
        const e = easeInOutCubic(clamp(this.moveT, 0, 1));
        mv.pairs.forEach(([a, b], pi) => {
          const ca = this.cups.find((c) => c.slot === a)!;
          const cb = this.cups.find((c) => c.slot === b)!;
          const xa = this.slotX(a, R.n),
            xb = this.slotX(b, R.n);
          const depth = 0.55 + 0.22 * Math.abs(a - b);
          const sgn = pi % 2 ? -1 : 1;
          ca.x = lerp(xa, xb, e);
          cb.x = lerp(xb, xa, e);
          ca.z = CUP_Z + Math.sin(Math.PI * e) * depth * sgn;
          cb.z = CUP_Z - Math.sin(Math.PI * e) * depth * sgn;
          ca.y = cb.y = Math.sin(Math.PI * e) * 0.12;
        });
        if (this.moveT >= 1) {
          for (const [a, b] of mv.pairs) {
            const ca = this.cups.find((c) => c.slot === a)!;
            const cb = this.cups.find((c) => c.slot === b)!;
            ca.slot = b;
            cb.slot = a;
            ca.y = cb.y = 0;
            ca.z = cb.z = CUP_Z;
          }
          this.sound("click");
          this.moveI++;
          this.moveT = 0;
          this.pt = 0;
        }
        break;
      }
      case "choose": {
        const left = CHOOSE - this.pt;
        this.hud.timer(left);
        const sec = Math.ceil(left);
        if (sec !== this.lastTick && sec <= 3 && sec > 0) {
          this.lastTick = sec;
          this.sound("tick");
        }
        this.players.forEach((_, i) => {
          const p = this.pad(i);
          const d = this.dirToCup(p.x, p.y, R.n);
          if (d !== null && d !== this.lastDir[i]) {
            this.lastDir[i] = d;
            if (!this.players[i].cpu) this.buzz(i, 15);
          }
          const q = this.qLabels[i];
          if (q) {
            const ok = this.lastDir[i] !== null;
            q.classList.toggle("ok", ok);
            const html = ok ? "✓" : "?";
            if (q.innerHTML !== html) {
              q.innerHTML = html;
              if (ok) this.sound("select");
            }
          }
          this.avatars[i].anim = "idle";
        });
        if (left <= 0) this.beginReveal();
        break;
      }
      case "reveal": {
        const t = this.pt;
        const sc = this.cups[this.starCup];
        // drumroll, then the star cup goes up, then the others
        if (t > 0.8 && t < 1.9) {
          this.drumT -= dt;
          if (this.drumT <= 0) {
            this.drumT = 0.075;
            this.sound("drum");
          }
          this.shake = Math.max(this.shake, 0.03);
        }
        if (t >= 1.9 && t - dt < 1.9) this.revealStar();
        sc.lift = t < 1.9 ? Math.sin(t * 30) * 0.02 * clamp(t - 0.8, 0, 1) : easeOutBack(clamp((t - 1.9) / 0.4, 0, 1)) * 1.6;
        for (const c of this.cups) if (c !== sc) c.lift = easeOutBack(clamp((t - 2.5) / 0.35, 0, 1)) * 1.1;
        if (t > 1.9) this.star.rotation.y += dt * 5;
        if (t > 4.6 && t - dt <= 4.6) this.players.forEach((_, i) => (this.avatars[i].anim = "idle"));
        const last = this.round >= ROUNDS.length - 1;
        if (last && t > 4.4) {
          for (const el of this.pickLabels) this.hud.removeLabel(el);
          this.pickLabels = [];
          this.phase = "done";
          this.finishByScore(this.scores);
          break;
        }
        if (t > 4.8) {
          const down = 1 - easeInOutCubic(clamp((t - 4.8) / 0.35, 0, 1));
          for (const c of this.cups) c.lift *= down;
        }
        if (t > 5.2) {
          for (const el of this.pickLabels) this.hud.removeLabel(el);
          this.pickLabels = [];
          this.star.rotation.y = 0;
          if (this.round >= ROUNDS.length - 1) {
            this.phase = "done";
            this.finishByScore(this.scores);
          } else this.startRound();
        }
        break;
      }
    }
    this.placeCups(dt);
    // players watch the cups
    if (this.phase !== "reveal" && this.phase !== "done")
      this.players.forEach((_, i) => {
        const a = this.avatars[i];
        const m = this.movers();
        const x = m.length ? m.reduce((s, c) => s + c.x, 0) / m.length : 0;
        a.faceTo(x, CUP_Z, dt, 4);
      });
  }

  private beginChoose() {
    this.phase = "choose";
    this.pt = 0;
    this.lastTick = -1;
    const R = ROUNDS[this.round];
    this.sayOne(HOST_LINES.choose, 2.5);
    this.sound("ding");
    this.hud.tip(T("Hold the stick toward the cup with the note · it's secret!", "把摇杆推向藏着票据的杯子 · 秘密作答！"));
    this.players.forEach((p, i) => {
      this.lastDir[i] = null;
      this.choice[i] = -1;
      this.qLabels[i] = this.hud.label(this.avatars[i].root, "?", { dy: 2.05, cls: "bn-q", color: "rgba(20,14,40,.82)" });
      this.qLabels[i]!.style.setProperty("--lc2", p.char.color);
      if (p.cpu) {
        // where the CPU thinks the star is
        const lv = p.level;
        const acc = clamp(0.5 + 0.45 * lv - 0.09 * this.round + (this.rnd() - 0.5) * 0.1, 0.25, 0.95);
        const right = this.cups[this.starCup].slot;
        let k = right;
        if (Math.random() > acc) {
          // lost track: usually a neighbour of the right cup
          const others = [...Array(R.n).keys()].filter((s) => s !== right);
          const near = others.filter((s) => Math.abs(s - right) === 1);
          const pool = Math.random() < 0.65 && near.length ? near : others;
          k = pool[Math.floor(Math.random() * pool.length)];
        }
        this.cpuPick[i] = k;
        this.cpuHold[i] = 0.5 + Math.random() * 2.8;
      }
    });
    // the arrows that pick each cup
    for (let k = 0; k < R.n; k++) {
      const th = Math.PI - (k * Math.PI) / (R.n - 1);
      const deg = -((th * 180) / Math.PI) + 90;
      const cup = this.cups.find((c) => c.slot === k)!;
      const el = this.hud.label(cup.g, `<div class="c"><svg viewBox="0 0 24 24" style="transform:rotate(${deg}deg)"><path d="M12 2 L21.5 12 H15.5 V22 H8.5 V12 H2.5 Z" fill="#ffd23f" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/></svg></div>`, { dy: -0.55, cls: "bn-arrow" });
      this.arrowLabels.push(el);
    }
  }

  private beginReveal() {
    this.phase = "reveal";
    this.pt = 0;
    this.drumT = 0;
    this.hud.timer(null);
    this.hud.tip(null);
    for (const el of this.arrowLabels) this.hud.removeLabel(el);
    this.arrowLabels = [];
    this.players.forEach((_, i) => {
      if (this.qLabels[i]) this.hud.removeLabel(this.qLabels[i]!);
      this.qLabels[i] = null;
      this.choice[i] = this.lastDir[i] ?? -1;
    });
    this.sound("confirm");
    this.say(T("Let's see…", "我们来看看……"), 2);
    // portraits over the chosen cups
    for (const c of this.cups) {
      const who = this.players.filter((_, i) => this.choice[i] === c.slot);
      if (!who.length) continue;
      const html = who.map((p) => `<div class="p" style="--pc:${p.char.color};background-image:url(${portrait(p.char.id)})"></div>`).join("");
      this.pickLabels.push(this.hud.label(this.anchors[this.cups.indexOf(c)], html, { dy: 0.55, cls: "bn-picks" }));
    }
    const none = this.players.filter((_, i) => this.choice[i] < 0);
    for (const p of none) this.hud.pop(this.avatars[p.i].pos.clone().setY(2.4), T("No pick", "没选"), "#ff8a7a", this.camera);
  }

  private revealStar() {
    const sc = this.cups[this.starCup];
    const right = sc.slot;
    this.sound("star");
    this.fx.sparkle({ x: sc.x, y: TABLE_Y + 0.9, z: sc.z }, "#ffe14a", 30);
    this.fx.ring({ x: sc.x, y: TABLE_Y, z: sc.z }, "#fff2a0", 1.8, 0.6);
    let any = false;
    this.players.forEach((p, i) => {
      const a = this.avatars[i];
      if (this.choice[i] === right) {
        any = true;
        this.scores[i]++;
        this.hud.setScore(p.i, `${COIN} ${this.scores[i]}`);
        this.hud.pop(a.pos.clone().setY(2.3), "+1", "#ffe14a", this.camera);
        this.fx.confetti({ x: a.pos.x, y: 1.8, z: a.pos.z }, 30);
        a.anim = "win";
        this.buzz(i, [40, 30, 40]);
      } else {
        a.anim = "lose";
      }
    });
    this.sound(any ? "cheer" : "aww");
    this.sayOne(any ? HOST_LINES.win : HOST_LINES.lose, 2.5);
  }

  protected outroStep(dt: number) {
    this.animHost(dt);
    this.star.rotation.y += dt * 3;
    this.placeCups(dt);
  }

  dispose() {
    this.cupGeo.dispose();
    super.dispose();
  }
}


const def: MiniDef = {
  id: "bonneteau",
  name: "Shielded Shuffle",
  icon: "🥤",
  color: "#ff9a2e",
  tagline: "Follow the cup that hides the shielded note.",
  rules: "Keep your eyes on the cup hiding the shielded note. When asked, hold the stick toward it (it's secret!): each right answer earns a ⓩ. 3 rounds, faster and faster.",
  controls: { stick: "Aim at a cup (hold it)" },
  modes: ["ffa"],
  length: 45,
  music: "paris",
  create: (ctx) => new Bonneteau(ctx),
};
export default def;
