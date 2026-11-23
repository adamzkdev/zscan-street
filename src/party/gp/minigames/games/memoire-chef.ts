/**
 * MÉMOIRE DE CHEF (chacun pour soi, 6 manches): in a bistro kitchen, the chef pulls ingredients
 * out of his big pot one after the other: tomate (↑), fromage (→), champignon (↓), basilic (←).
 * Then everyone types the recipe back at once with the stick (only "✓" lights show, so nobody can
 * copy). One mistake = out of that round. 3, 4, 5… ingredients; +1 per recipe right. Ends after
 * 6 rounds, or when nobody gets two recipes in a row. Most points wins.
 */
import * as THREE from "three";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef } from "../types";
import { ball, box, canvasTex, cone, cyl, flat, group, mesh, toon } from "../../engine/gfx";
import { clamp, easeOutBack } from "../../engine/util";
import { COIN } from "../../engine/hud";
import { sfx, music } from "../../engine/audio";
import { T } from "../../../../i18n/lang";

const ROUNDS = 6;
const FIRST_LEN = 3;
/** The ingredients' names, English and Chinese (read with T when shown: the language can change). */
const NAMES: [string, string][] = [
  ["Tomato", "番茄"],
  ["Cheese", "奶酪"],
  ["Mushroom", "蘑菇"],
  ["Basil", "罗勒"],
];
const COLORS = ["#ff4b3e", "#ffc928", "#c98a5a", "#3fcf5a"];
/** Notes (semitones from A4) for each ingredient: a happy chord. */
const NOTES = [7, 4, 0, -5];
/** dir index: 0 up, 1 right, 2 down, 3 left. */
const ARROW_DEG = [0, 90, 180, 270];
const STATION_X = [-5.4, -1.8, 1.8, 5.4];
const STATION_Z = 1.6;
/** The cooks stand on a step this high. */
const STEP = 0.4;

/** Paint one ingredient icon on a 2D canvas (size s, centred). */
function paintIngredient(g: CanvasRenderingContext2D, k: number, s: number) {
  const c = s / 2;
  g.save();
  g.lineJoin = "round";
  g.lineWidth = s * 0.035;
  g.strokeStyle = "#1d1630";
  if (k === 0) {
    // tomato
    g.fillStyle = "#ff3b30";
    g.beginPath();
    g.ellipse(c, c + s * 0.05, s * 0.38, s * 0.34, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = "rgba(255,255,255,0.55)";
    g.beginPath();
    g.ellipse(c - s * 0.15, c - s * 0.06, s * 0.08, s * 0.05, -0.6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#2faa3a";
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 ? s * 0.06 : s * 0.17;
      g.lineTo(c + Math.cos(a) * r, c - s * 0.25 + Math.sin(a) * r * 0.6);
    }
    g.closePath();
    g.fill();
    g.stroke();
  } else if (k === 1) {
    // cheese wedge
    g.fillStyle = "#ffd23f";
    g.beginPath();
    g.moveTo(c - s * 0.4, c + s * 0.26);
    g.lineTo(c + s * 0.4, c + s * 0.26);
    g.lineTo(c + s * 0.4, c - s * 0.06);
    g.lineTo(c - s * 0.4, c + s * 0.02);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = "#ffe98a";
    g.beginPath();
    g.moveTo(c - s * 0.4, c + s * 0.02);
    g.lineTo(c + s * 0.4, c - s * 0.06);
    g.lineTo(c + s * 0.12, c - s * 0.3);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = "#e8a800";
    for (const [x, y, r] of [
      [-0.2, 0.14, 0.06],
      [0.1, 0.1, 0.045],
      [0.25, 0.18, 0.05],
      [-0.02, 0.2, 0.03],
    ]) {
      g.beginPath();
      g.arc(c + x * s, c + y * s, r * s, 0, Math.PI * 2);
      g.fill();
    }
  } else if (k === 2) {
    // mushroom
    g.fillStyle = "#f3e2c4";
    g.beginPath();
    g.roundRect(c - s * 0.11, c - s * 0.02, s * 0.22, s * 0.36, s * 0.08);
    g.fill();
    g.stroke();
    g.fillStyle = "#e8402c";
    g.beginPath();
    g.ellipse(c, c, s * 0.4, s * 0.3, 0, Math.PI, 0);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = "#ffffff";
    for (const [x, y, r] of [
      [-0.2, -0.08, 0.06],
      [0.05, -0.2, 0.055],
      [0.22, -0.07, 0.05],
      [-0.04, -0.06, 0.035],
    ]) {
      g.beginPath();
      g.arc(c + x * s, c + y * s, r * s, 0, Math.PI * 2);
      g.fill();
    }
  } else {
    // basil: three leaves
    const leaf = (x: number, y: number, a: number, l: number) => {
      g.save();
      g.translate(c + x * s, c + y * s);
      g.rotate(a);
      g.fillStyle = "#2fbf4a";
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(l * s * 0.5, -l * s * 0.45, 0, -l * s);
      g.quadraticCurveTo(-l * s * 0.5, -l * s * 0.45, 0, 0);
      g.fill();
      g.stroke();
      g.strokeStyle = "#1a8a32";
      g.lineWidth = s * 0.02;
      g.beginPath();
      g.moveTo(0, -s * 0.02);
      g.lineTo(0, -l * s * 0.85);
      g.stroke();
      g.restore();
    };
    leaf(0, 0.32, -0.75, 0.42);
    leaf(0, 0.32, 0.75, 0.42);
    leaf(0, 0.34, 0, 0.6);
  }
  g.restore();
}

const iconCache: string[] = [];
function iconUrl(k: number) {
  if (iconCache[k]) return iconCache[k];
  const cv = document.createElement("canvas");
  cv.width = cv.height = 160;
  paintIngredient(cv.getContext("2d")!, k, 160);
  iconCache[k] = cv.toDataURL();
  return iconCache[k];
}

interface Cook {
  pos: number;
  state: "wait" | "play" | "done" | "fail";
  armed: boolean;
  lights: HTMLElement | null;
  /** CPU: the directions it will type and when. */
  plan: number[];
  next: number;
  holdUntil: number;
  holdDir: number;
  missRun: number;
}

class MemoireChef extends BaseMini {
  private round = -1;
  private phase: "wait" | "intro" | "show" | "input" | "result" | "done" = "wait";
  private pt = 0;
  private seq: number[] = [];
  private showI = -1;
  private cooks: Cook[] = [];
  private scores: number[] = [];
  private failStreak = 0;
  private chef!: THREE.Group;
  private chefArm!: THREE.Group;
  private pot!: THREE.Group;
  private steam: THREE.Mesh[] = [];
  private shown: THREE.Group | null = null;
  private ing3d: THREE.Group[] = [];
  private bowls: THREE.Group[] = [];
  private legend!: HTMLElement;
  private bigCard: HTMLElement | null = null;
  private inputTime = 0;
  private lastTick = -1;

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#ffe9c8", "#ffd6a0"], size: 12, sun: [0.3, 1, 0.8], fog: null, hemi: ["#fff4e0", "#a08060", 1.7] });
    this.ing3d = [0, 1, 2, 3].map((k) => this.makeIngredient(k));
    this.buildKitchen();
    this.buildChef();
    this.players.forEach((p, i) => {
      const x = STATION_X[i];
      const st = group(this.scene, { x, z: STATION_Z });
      box(st, "#f4efe6", 2.6, 1.0, 1.2, { y: 0.5 });
      box(st, p.char.color, 2.62, 0.18, 1.22, { y: 0.92 });
      box(st, "#c9925a", 1.3, 0.08, 0.8, { y: 1.05, x: -0.45 });
      const bowl = group(st, { x: 0.55, y: 1.0 });
      cyl(bowl, "#ffffff", 0.42, 0.3, { y: 0.15, rTop: 0.5, seg: 20 });
      cyl(bowl, p.char.color, 0.43, 0.08, { y: 0.24, rTop: 0.48, seg: 20, cast: false });
      this.bowls.push(bowl);
      // (on a step behind the station: a zkSNARK's face shows over the counter and its bowl)
      box(this.scene, "#b88a5a", 1.3, STEP, 0.9, { x, y: STEP / 2, z: STATION_Z - 1.15 });
      const a = this.spawn(i, x, STATION_Z - 1.15, 0);
      a.pos.y = STEP;
      a.groundY = STEP;
      a.setRing(p.char.color);
      this.scores.push(0);
      this.cooks.push({ pos: 0, state: "wait", armed: true, lights: null, plan: [], next: 0, holdUntil: 0, holdDir: -1, missRun: 0 });
    });
    const cell = (k: number, pos: string) => `<div class="mc-cell" style="${pos}"><img src="${iconUrl(k)}"><i style="transform:rotate(${ARROW_DEG[k]}deg)"></i></div>`;
    this.hud.add(
      `<style>
      .mc-legend{position:absolute;right:calc(var(--u)*2);top:calc(var(--u)*8.6);width:calc(var(--u)*15.5);height:calc(var(--u)*15.5);border-radius:50%;background:rgba(255,250,240,.9);border:calc(var(--u)*.4) solid #1d1630;box-shadow:0 calc(var(--u)*.5) 0 rgba(0,0,0,.3)}
      .mc-cell{position:absolute;width:calc(var(--u)*5.4);height:calc(var(--u)*5.4);margin:calc(var(--u)*-2.7) 0 0 calc(var(--u)*-2.7);border-radius:50%;background:#fff;border:calc(var(--u)*.3) solid #1d1630;transition:transform .12s,background .12s}
      .mc-cell img{width:100%;height:100%}
      .mc-cell i{position:absolute;left:50%;top:50%;width:0;height:0}
      .mc-cell i:before{content:"";position:absolute;left:calc(var(--u)*-1);top:calc(var(--u)*-4.4);border-left:calc(var(--u)*1) solid transparent;border-right:calc(var(--u)*1) solid transparent;border-bottom:calc(var(--u)*1.3) solid #1d1630}
      .mc-cell.on{transform:scale(1.35);background:#ffe14a;z-index:2}
      .mc-legend .hub{position:absolute;left:50%;top:50%;width:calc(var(--u)*2.4);height:calc(var(--u)*2.4);margin:calc(var(--u)*-1.2) 0 0 calc(var(--u)*-1.2);border-radius:50%;background:#4a5070;border:calc(var(--u)*.3) solid #1d1630}
      .mc-big{position:absolute;left:50%;top:22%;transform:translate(-50%,-50%);text-align:center;animation:mcpop .25s cubic-bezier(.2,1.7,.4,1)}
      .mc-big img{width:calc(var(--u)*13);height:calc(var(--u)*13);filter:drop-shadow(0 calc(var(--u)*.6) 0 rgba(0,0,0,.3))}
      .mc-big .nm{font-family:var(--title);font-size:calc(var(--u)*3.4);color:#fff;-webkit-text-stroke:calc(var(--u)*.3) #1d1630;paint-order:stroke fill;margin-top:calc(var(--u)*-1)}
      .mc-big .k{font-family:var(--title);font-size:calc(var(--u)*2);color:#1d1630;background:#fff;border-radius:999px;padding:0 calc(var(--u)*1);display:inline-block;border:calc(var(--u)*.25) solid #1d1630}
      @keyframes mcpop{0%{transform:translate(-50%,-50%) scale(.2)}100%{transform:translate(-50%,-50%) scale(1)}}
      .mc-lights{background:rgba(20,14,40,.85)!important;display:flex;gap:calc(var(--u)*.35);padding:calc(var(--u)*.45) calc(var(--u)*.7)!important}
      .mc-lights b{width:calc(var(--u)*1.5);height:calc(var(--u)*1.5);border-radius:50%;background:#4a4560;border:calc(var(--u)*.2) solid #8a84a0}
      .mc-lights b.g{background:#3fcf5a;border-color:#bfffc8;box-shadow:0 0 calc(var(--u)*.8) #3fcf5a}
      .mc-lights b.r{background:#ff4b3e;border-color:#ffc0b8}
      .mc-lights.done{background:#2fbf5a!important}
      .mc-lights.fail{background:#a02a22!important}
      .mc-lights .t{font-family:var(--title);font-size:calc(var(--u)*1.6);line-height:calc(var(--u)*1.5)}
      </style>
      <div class="mc-legend">${cell(0, "left:50%;top:19%")}${cell(1, "left:81%;top:50%")}${cell(2, "left:50%;top:81%")}${cell(3, "left:19%;top:50%")}<div class="hub"></div></div>`,
    );
    this.legend = this.hud.root.lastElementChild as HTMLElement;
    this.hud.players(this.players, () => `${COIN} 0`);
    this.setCam([0, 10, 22], [0, 1.8, -1], 42);
  }

  // ------------------------------------------------------------ ingredients (3D)

  private makeIngredient(k: number) {
    const g = new THREE.Group();
    if (k === 0) {
      ball(g, "#ff3b30", [0.5, 0.44, 0.5]);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        cone(g, "#2faa3a", 0.09, 0.32, { x: Math.cos(a) * 0.14, y: 0.42, z: Math.sin(a) * 0.14, rz: Math.cos(a) * 1.2, rx: -Math.sin(a) * 1.2, lo: true });
      }
      cyl(g, "#2a8a32", 0.04, 0.16, { y: 0.5, seg: 6 });
    } else if (k === 1) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.5, 16, 1, false, 0, Math.PI / 3), toon("#ffd23f"));
      w.castShadow = true;
      w.position.set(-0.3, 0, -0.1);
      g.add(w);
      for (const [x, y, z] of [
        [0.05, 0.1, 0.32],
        [0.2, -0.1, 0.18],
      ])
        ball(g, "#e8a800", 0.07, { x, y, z, lo: true, cast: false });
    } else if (k === 2) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), toon("#e8402c"));
      cap.position.y = 0.05;
      cap.scale.y = 0.75;
      cap.castShadow = true;
      g.add(cap);
      cyl(g, "#f3e2c4", 0.17, 0.5, { y: -0.18, seg: 12 });
      for (const [x, z] of [
        [0.2, 0.25],
        [-0.25, 0.15],
        [0.05, -0.3],
        [0, 0.05],
      ])
        ball(g, "#ffffff", 0.07, { x, y: 0.3, z, lo: true, cast: false });
    } else {
      for (const [a, s] of [
        [-0.7, 0.9],
        [0.7, 0.9],
        [0, 1.15],
      ])
        ball(g, "#2fbf4a", [0.16 * s, 0.38 * s, 0.07], { rz: a, y: 0.2 * s, x: -Math.sin(a) * 0.15 });
      cyl(g, "#1a8a32", 0.03, 0.3, { y: -0.12, seg: 5 });
    }
    return g;
  }

  // ------------------------------------------------------------ the kitchen

  private buildKitchen() {
    const s = this.scene;
    const floorTex = canvasTex(
      256,
      256,
      (g, w) => {
        for (let y = 0; y < 4; y++)
          for (let x = 0; x < 4; x++) {
            g.fillStyle = (x + y) % 2 ? "#2a2a3a" : "#f4efe6";
            g.fillRect((x * w) / 4, (y * w) / 4, w / 4, w / 4);
          }
      },
      true,
    );
    floorTex.repeat.set(10, 10);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshToonMaterial({ map: floorTex }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);
    // back wall: white tiles with a blue frieze
    const wallTex = canvasTex(
      256,
      256,
      (g, w) => {
        g.fillStyle = "#cfd8e0";
        g.fillRect(0, 0, w, w);
        for (let y = 0; y < 8; y++)
          for (let x = 0; x < 8; x++) {
            g.fillStyle = "#ffffff";
            g.fillRect(x * 32 + 2, y * 32 + 2, 28, 28);
          }
      },
      true,
    );
    wallTex.repeat.set(12, 4);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(40, 12), new THREE.MeshToonMaterial({ map: wallTex }));
    wall.position.set(0, 6, -7);
    s.add(wall);
    box(s, "#2f6fd0", 40, 0.4, 0.1, { y: 3.2, z: -6.95, cast: false });
    for (const x of [-16, 16]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(20, 12), new THREE.MeshToonMaterial({ map: wallTex }));
      side.position.set(x, 6, 3);
      side.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
      s.add(side);
    }
    // a window with a sunny view
    const win = group(s, { x: -8, y: 5.6, z: -6.9 });
    box(win, "#8fd4ff", 3.6, 2.6, 0.05, { cast: false });
    box(win, "#ffffff", 3.9, 0.2, 0.15, { y: 1.35 });
    box(win, "#ffffff", 3.9, 0.2, 0.15, { y: -1.35 });
    box(win, "#ffffff", 0.2, 2.8, 0.15, { x: 1.85 });
    box(win, "#ffffff", 0.2, 2.8, 0.15, { x: -1.85 });
    box(win, "#ffffff", 0.12, 2.6, 0.12);
    ball(win, "#7fd14a", [1.2, 0.6, 0.1], { x: -0.6, y: -1.0, z: 0.03, cast: false });
    box(win, "#ff7ad9", 3.4, 0.4, 0.5, { y: -1.6, z: 0.3 });
    // shelves with jars, and hanging copper pans
    for (const sx of [1, -1]) {
      const sh = group(s, { x: sx * 9, y: 5.2, z: -6.75 });
      box(sh, "#a8703f", 5, 0.15, 0.6);
      const jars = ["#ff7a3e", "#ffd23f", "#9b5cff", "#3fcf5a", "#ff4b8b"];
      for (let k = 0; k < 5; k++) {
        cyl(sh, flat(jars[(k + (sx > 0 ? 2 : 0)) % 5], 0.85), 0.25, 0.6 + (k % 2) * 0.2, { x: -2 + k, y: 0.4 + (k % 2) * 0.1, seg: 12 });
        cyl(sh, "#e8e0d0", 0.27, 0.1, { x: -2 + k, y: 0.75 + (k % 2) * 0.2, seg: 12 });
      }
    }
    box(s, "#6a6a7a", 10, 0.1, 0.1, { y: 8.2, z: -5.5, cast: false });
    for (let k = 0; k < 5; k++) {
      const pan = group(s, { x: -4 + k * 2, y: 7.3 - (k % 2) * 0.3, z: -5.5 });
      cyl(pan, "#d8884a", 0.45 + (k % 3) * 0.1, 0.12, { rx: Math.PI / 2, seg: 18 });
      box(pan, "#8a5a32", 0.1, 0.9, 0.08, { y: 0.8 });
    }
    // the chef's counter, stove and big pot
    box(s, "#7a8a9a", 7, 1.1, 1.6, { y: 0.55, z: -3.6 });
    box(s, "#a8b4c0", 7.1, 0.12, 1.7, { y: 1.15, z: -3.6 });
    box(s, "#3a3a4a", 2.2, 0.05, 1.2, { y: 1.22, z: -3.6, x: 2 });
    this.pot = group(s, { x: 2, y: 1.24, z: -3.6 });
    cyl(this.pot, "#5a6270", 0.85, 1.1, { y: 0.55, seg: 24 });
    cyl(this.pot, "#8a94a4", 0.92, 0.12, { y: 1.1, seg: 24 });
    const soup = new THREE.Mesh(new THREE.CircleGeometry(0.82, 24), toon("#ff9a3e", "#ff6a1e", 0.35));
    soup.rotation.x = -Math.PI / 2;
    soup.position.y = 1.08;
    this.pot.add(soup);
    for (const sx of [-1, 1]) box(this.pot, "#3a3a4a", 0.3, 0.12, 0.15, { x: sx * 0.98, y: 0.9 });
    for (let k = 0; k < 3; k++) {
      const st = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), flat("#ffffff", 0.55));
      this.pot.add(st);
      this.steam.push(st);
    }
    // a menu board
    const menu = canvasTex(256, 320, (g, w, h) => {
      g.fillStyle = "#2a3a2a";
      g.fillRect(0, 0, w, h);
      g.strokeStyle = "#a8703f";
      g.lineWidth = 16;
      g.strokeRect(8, 8, w - 16, h - 16);
      g.fillStyle = "#fff";
      g.font = 'bold 40px "Lilita One", sans-serif';
      g.textAlign = "center";
      g.fillText(T("MENU", "菜单"), w / 2, 62);
      g.font = '26px "Fredoka", sans-serif';
      [T("Shielded Soup", "屏蔽浓汤"), T("Sapling Salad", "树苗沙拉"), T("Halo Omelette", "光环煎蛋"), T("Orchard Tart", "果园挞")].forEach((t, i) => g.fillText(t, w / 2, 120 + i * 48));
    });
    const mb = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.75), new THREE.MeshToonMaterial({ map: menu }));
    mb.position.set(7.5, 4.6, -6.9);
    s.add(mb);
  }

  private buildChef() {
    const g = group(this.scene, { x: -0.6, z: -4.8 });
    this.chef = g;
    box(g, "#2a2a3a", 0.9, 1.4, 0.6, { y: 0.7 });
    ball(g, "#ffffff", [1.05, 1.15, 0.85], { y: 2.15 });
    // apron and buttons
    box(g, "#e8eef4", 1.1, 1.1, 0.1, { y: 1.85, z: 0.78, cast: false });
    for (let k = 0; k < 3; k++) ball(g, "#1d1630", 0.06, { y: 2.6 - k * 0.25, z: 0.86, x: 0.25, lo: true, cast: false });
    const head = group(g, { y: 3.45 });
    ball(head, "#ffd2b0", 0.62);
    ball(head, "#ff9a8a", 0.13, { y: -0.02, z: 0.6, lo: true });
    for (const sx of [-1, 1]) {
      ball(head, "#1d1630", 0.08, { x: sx * 0.22, y: 0.12, z: 0.55, cast: false, lo: true });
      ball(head, "#ff9a9a", 0.12, { x: sx * 0.36, y: -0.1, z: 0.45, cast: false, lo: true });
      ball(head, "#c86a3a", [0.22, 0.08, 0.1], { x: sx * 0.2, y: -0.2, z: 0.58, rz: sx * 0.3, cast: false });
    }
    // tall toque
    cyl(head, "#ffffff", 0.5, 0.25, { y: 0.55, seg: 20 });
    ball(head, "#ffffff", [0.62, 0.5, 0.62], { y: 1.0 });
    ball(head, "#ffffff", 0.32, { y: 1.25, x: 0.3, lo: true });
    ball(head, "#ffffff", 0.32, { y: 1.25, x: -0.3, lo: true });
    // red neckerchief
    cone(g, "#e8302f", 0.3, 0.4, { y: 2.95, z: 0.6, rx: Math.PI, lo: true });
    // arms: the right one raises the ingredients
    for (const sx of [-1, 1]) {
      const arm = group(g, { x: sx * 0.95, y: 2.7 });
      cyl(arm, "#ffffff", 0.16, 0.9, { y: -0.45, seg: 10 });
      ball(arm, "#ffd2b0", 0.18, { y: -0.95, lo: true });
      arm.rotation.z = sx * 0.3;
      if (sx > 0) this.chefArm = arm;
    }
  }

  // ------------------------------------------------------------ rounds

  private startRound() {
    this.round++;
    const L = FIRST_LEN + this.round;
    this.seq = [];
    for (let k = 0; k < L; k++) {
      let d = Math.floor(this.rnd() * 4);
      // no triple repeats
      if (k >= 2 && this.seq[k - 1] === d && this.seq[k - 2] === d) d = (d + 1 + Math.floor(this.rnd() * 3)) % 4;
      this.seq.push(d);
    }
    this.phase = "intro";
    this.pt = 0;
    this.showI = -1;
    this.hud.banner(T(`RECIPE ${this.round + 1} / ${ROUNDS}`, `菜谱 ${this.round + 1} / ${ROUNDS}`), { color: "#ffd23f", sub: T(`${L} ingredients`, `${L} 种食材`), ms: 900 });
    this.sound("bell");
    this.cooks.forEach((c, i) => {
      c.pos = 0;
      c.state = "wait";
      c.armed = true;
      c.next = 0;
      c.holdDir = -1;
      if (c.lights) this.hud.removeLabel(c.lights);
      c.lights = this.hud.label(this.avatars[i].root, this.lightsHtml(c), { dy: 2.05, cls: "mc-lights" });
      this.avatars[i].anim = "idle";
    });
    if (this.round === 3) music.speed(1.1);
  }

  private lightsHtml(c: Cook) {
    if (c.state === "done") return `<span class="t">${T("NICE!", "成功！")}</span>`;
    let h = "";
    for (let k = 0; k < this.seq.length; k++) h += `<b class="${k < c.pos ? "g" : c.state === "fail" && k === c.pos ? "r" : ""}"></b>`;
    return h;
  }
  private refresh(i: number) {
    const c = this.cooks[i];
    if (!c.lights) return;
    c.lights.innerHTML = this.lightsHtml(c);
    c.lights.classList.toggle("done", c.state === "done");
    c.lights.classList.toggle("fail", c.state === "fail");
  }

  start() {
    this.startRound();
  }

  protected idle(dt: number) {
    this.moveCam([0, 6.3, 12.5], [0, 2.0, -1.2], dt, 1.4);
    this.animKitchen(dt);
  }

  private animKitchen(dt: number) {
    const t = this.t + this.pt;
    this.steam.forEach((m, k) => {
      const u = (t * 0.5 + k / 3) % 1;
      m.position.set(Math.sin(t * 2 + k * 2) * 0.3, 1.2 + u * 1.6, Math.cos(t * 1.5 + k) * 0.2);
      m.scale.setScalar(0.4 + u * 1.1);
      m.visible = u < 0.92;
    });
    this.chef.position.y = Math.abs(Math.sin(t * 2.4)) * 0.04;
    void dt;
  }

  /** The CPU's run for this round: it gets the recipe right with a chance that falls with length. */
  private planCpu(i: number) {
    const c = this.cooks[i];
    const lv = this.players[i].level;
    const L = this.seq.length;
    const cap = 3.6 + 4.2 * lv;
    const pOk = clamp(1 - (L - cap + 1.2) * 0.28, 0.06, 0.97);
    c.plan = [...this.seq];
    if (Math.random() > pOk) {
      // a slip, more likely toward the end
      const at = Math.min(L - 1, Math.floor(Math.pow(Math.random(), 0.6) * L));
      c.plan[at] = (c.plan[at] + 1 + Math.floor(Math.random() * 3)) % 4;
      c.plan.length = at + 1;
    }
    c.next = 0.4 + Math.random() * 0.4 + (1 - lv) * 0.4;
    c.holdUntil = 0;
    c.holdDir = -1;
  }

  protected cpu(i: number): CpuPad {
    const c = this.cooks[i];
    if (this.phase !== "input" || c.state !== "play") return {};
    if (c.holdDir >= 0 && this.pt < c.holdUntil) {
      const d = c.holdDir;
      return { x: d === 1 ? 1 : d === 3 ? -1 : 0, y: d === 0 ? -1 : d === 2 ? 1 : 0 };
    }
    c.holdDir = -1;
    if (this.pt >= c.next && c.pos < c.plan.length) {
      const lv = this.players[i].level;
      c.holdDir = c.plan[c.pos];
      c.holdUntil = this.pt + 0.14;
      c.next = this.pt + 0.22 + Math.random() * 0.25 + (1 - lv) * 0.25 + (c.pos === 2 || c.pos === 5 ? 0.25 * Math.random() : 0);
    }
    return {};
  }

  protected step(dt: number) {
    this.pt += dt;
    this.animKitchen(dt);
    this.moveCam([0, 6.3, 12.5], [0, 2.0, -1.2], dt, 2);
    switch (this.phase) {
      case "intro":
        this.chefArm.rotation.z = 0.3;
        if (this.pt > 1.1) {
          this.phase = "show";
          this.pt = 0;
          this.showI = -1;
          this.hud.tip(T("Remember the recipe…", "记住菜谱……"));
        }
        break;
      case "show":
        this.stepShow(dt);
        break;
      case "input":
        this.stepInput();
        break;
      case "result":
        if (this.pt > 1.6) {
          const anyOk = this.cooks.some((c) => c.state === "done");
          this.failStreak = anyOk ? 0 : this.failStreak + 1;
          if (this.round >= ROUNDS - 1 || this.failStreak >= 2) {
            this.phase = "done";
            if (this.failStreak >= 2) this.hud.banner(T("KITCHEN CLOSED!", "厨房打烊！"), { color: "#ff9a8a", sub: T("Nobody got it two rounds running", "连续两轮没人做对") });
            this.finishByScore(this.scores);
          } else this.startRound();
        }
        break;
    }
    // the shown ingredient flies up out of the pot, then drops back
    if (this.shown) {
      const u = this.showDur > 0 ? clamp(this.pt - this.showStart, 0, 10) / this.showDur : 1;
      const y = u < 0.25 ? easeOutBack(u / 0.25) * 2.6 : u < 0.8 ? 2.6 + Math.sin((u - 0.25) * 6) * 0.08 : 2.6 - ((u - 0.8) / 0.2) * 2.4;
      this.shown.position.set(2 + (u > 0.8 ? 0 : 0), 1.24 + 1.0 + y, -3.4);
      this.shown.rotation.y += dt * 3;
      this.shown.scale.setScalar(1.35);
    }
    // the chef's raising arm
    this.chefArm.rotation.z = this.phase === "show" && this.shown ? 2.4 + Math.sin(this.t * 10) * 0.08 : 0.3 + Math.sin(this.t * 3) * 0.05;
  }

  private showStart = 0;
  private showDur = 0;

  private stepShow(_dt: number) {
    const L = this.seq.length;
    const per = clamp(0.78 - this.round * 0.055, 0.5, 0.8);
    const gap = 0.12;
    const k = Math.floor(this.pt / (per + gap));
    const inItem = this.pt - k * (per + gap) < per;
    if (k >= L) {
      this.clearShown();
      if (this.pt > L * (per + gap) + 0.3) this.beginInput();
      return;
    }
    if (k !== this.showI && inItem) {
      this.showI = k;
      const d = this.seq[k];
      this.clearShown();
      this.shown = this.ing3d[d].clone();
      this.scene.add(this.shown);
      this.showStart = this.pt;
      this.showDur = per;
      this.bigCard = this.hud.add(`<img src="${iconUrl(d)}"><div class="nm">${T(...NAMES[d])}</div><div class="k">${k + 1} / ${L}</div>`, "mc-big");
      this.cellOn(d, true);
      sfx.note(NOTES[d], 0.28, "triangle", 0.16);
      this.sound("pop");
      this.fx.sparkle({ x: 2, y: 3.2, z: -3.4 }, COLORS[d], 10);
    } else if (!inItem && this.shown) this.clearShown();
  }

  private clearShown() {
    this.shown?.removeFromParent();
    this.shown = null;
    this.bigCard?.remove();
    this.bigCard = null;
    this.legend.querySelectorAll(".mc-cell.on").forEach((e) => e.classList.remove("on"));
  }
  private cellOn(d: number, on: boolean) {
    this.legend.querySelectorAll(".mc-cell")[d]?.classList.toggle("on", on);
  }

  private beginInput() {
    this.phase = "input";
    this.pt = 0;
    this.lastTick = -1;
    this.inputTime = 2.5 + this.seq.length * 0.9;
    this.hud.banner(T("YOUR TURN!", "轮到你们！"), { color: "#7dff8a", ms: 700 });
    this.sound("go");
    this.hud.tip(T("Cook it back with the stick, in order!", "用摇杆按顺序做出来！"));
    this.cooks.forEach((c, i) => {
      c.state = "play";
      c.pos = 0;
      c.armed = Math.hypot(this.pad(i).x, this.pad(i).y) < 0.35;
      if (this.players[i].cpu) this.planCpu(i);
      this.refresh(i);
    });
  }

  private stepInput() {
    const left = this.inputTime - this.pt;
    this.hud.timer(left);
    const sec = Math.ceil(left);
    if (sec !== this.lastTick && sec <= 3 && sec > 0) {
      this.lastTick = sec;
      this.sound("tick");
    }
    this.cooks.forEach((c, i) => {
      if (c.state !== "play") return;
      const p = this.pad(i);
      const m = Math.hypot(p.x, p.y);
      if (m < 0.35) {
        c.armed = true;
        return;
      }
      if (!c.armed || m < 0.65) return;
      c.armed = false;
      const d = Math.abs(p.x) > Math.abs(p.y) ? (p.x > 0 ? 1 : 3) : p.y < 0 ? 0 : 2;
      const a = this.avatars[i];
      const bowl = this.bowls[i].getWorldPosition(new THREE.Vector3());
      if (d === this.seq[c.pos]) {
        c.pos++;
        sfx.note(NOTES[d] + 12, 0.12, "triangle", 0.08);
        a.anim = "hit";
        this.fx.burst({ x: bowl.x, y: bowl.y + 0.4, z: bowl.z }, { count: 6, colors: ["#ffffff", "#ffe9b0"], speed: 2, up: 2, size: 0.1, life: 0.4 });
        this.buzz(i, 15);
        if (c.pos >= this.seq.length) {
          c.state = "done";
          this.scores[i]++;
          this.hud.setScore(this.players[i].i, `${COIN} ${this.scores[i]}`);
          this.hud.pop(a.pos.clone().setY(2.6), "+1", "#ffe14a", this.camera);
          this.fx.sparkle({ x: a.pos.x, y: 1.8, z: a.pos.z }, "#ffe14a", 20);
          this.sound("coin");
          a.anim = "win";
          this.buzz(i, [40, 30, 40]);
        }
      } else {
        c.state = "fail";
        this.sound("wrong");
        this.fx.burst({ x: bowl.x, y: bowl.y + 0.5, z: bowl.z }, { count: 14, colors: ["#5a5466", "#8a8494"], speed: 2, up: 3, size: 0.2, life: 0.8, gravity: -1 });
        a.anim = "lose";
        a.flash();
        this.buzz(i, [80, 40, 80]);
      }
      this.refresh(i);
    });
    const allDone = this.cooks.every((c) => c.state !== "play");
    if (allDone || left <= 0) {
      this.cooks.forEach((c, i) => {
        if (c.state === "play") {
          c.state = "fail";
          this.avatars[i].anim = "lose";
          this.refresh(i);
        }
      });
      this.phase = "result";
      this.pt = 0;
      this.hud.timer(null);
      this.hud.tip(null);
      const ok = this.cooks.filter((c) => c.state === "done").length;
      if (ok) {
        this.sound("cheer");
        this.hud.banner(ok === this.cooks.length ? T("EVERYONE GOT IT!", "全员成功！") : ok === 1 ? T("ONLY ONE COOK GOT IT!", "只有一位厨师成功！") : T(`${ok} COOKS GOT IT!`, `${ok} 位厨师成功！`), { color: "#ffd23f", size: 6 });
      } else {
        this.sound("aww");
        this.hud.banner(T("NOBODY GOT IT!", "全员失败！"), { color: "#ff9a8a", size: 6 });
      }
    }
  }

  protected outroStep(dt: number) {
    this.pt += dt;
    this.animKitchen(dt);
  }

  dispose() {
    this.clearShown();
    // the ingredient templates live outside the scene
    for (const g of this.ing3d)
      g.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry && !m.geometry.userData?.shared) m.geometry.dispose();
      });
    super.dispose();
  }
}

void mesh;

const def: MiniDef = {
  id: "memoire-chef",
  name: "Chef's Memory",
  icon: "🧠",
  color: "#ff9ad5",
  tagline: "Remember the recipe, cook it back in order.",
  rules: "The chef shows a recipe: tomato ↑, cheese →, mushroom ↓, basil ←. Redo it in order with the stick. A slip and you're out of the round; every recipe right scores 1 point.",
  controls: { stick: "Add an ingredient (↑ → ↓ ←)" },
  modes: ["ffa"],
  length: 60,
  music: "rome",
  create: (ctx) => new MemoireChef(ctx),
};
export default def;
