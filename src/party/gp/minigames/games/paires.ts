/**
 * ZK MEMO (duel, 90 s max): a cosy game room; a big tilted board holds 20 cards, 10 pairs of
 * zkSNARKs (drawn by the seed, never the players' own), each face the zkSNARK's own pixel art and
 * its number, the backs a gold ⓩ on Zcash violet. Turn by turn, the active player moves a cursor
 * with the stick and flips two cards with A: a pair flies to their pile (+1) and they play again;
 * otherwise the cards flip back and the turn passes. Most pairs when the board is empty (or at
 * 90 s) wins.
 */
import * as THREE from "three";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef } from "../types";
import { ball, box, canvasTex, cone, cyl, group, toon } from "../../engine/gfx";
import { clamp, easeInOutCubic, easeOutBack } from "../../engine/util";
import { music } from "../../engine/audio";
import { personImage, rivalIds } from "../../../people";
import { T } from "../../../../i18n/lang";

const COLS = 5;
const ROWS = 4;
const CW = 1.75;
const CH = 2.3;
const GX = 2.05;
const GY = 2.6;
const TIME = 90;
const TURN_T = 9;
const BOARD_TILT = -0.42;
const BOARD_Y = 4.6;
const BOARD_Z = -1.2;

/** How many pairs (one zkSNARK each). */
const PAIRS = (COLS * ROWS) / 2;
/** The cards' canvases (the card's own 1.75 : 2.3), and the portrait: the art's 26 px grid × 10, crisp. */
const FW = 312;
const FH = 410;
const ART = 260;
/** Each pair's caption colour (a second clue to remember them by). */
const BANDS = ["#ff5a4e", "#ff9a2e", "#e8a812", "#3fbf5a", "#22b8a0", "#2f8dff", "#5a5cff", "#a65cff", "#ff5ca8", "#5f7290"];
const GOLD = "#f4b728";
/** The caption's font (the HUD's own, loaded by the page). */
const CAPTION = '800 58px Geist, Roboto, system-ui, sans-serif';
const INK = "#1d1630";

/** The Zcash Z (bars, diagonal and the two stubs) centred on (cx, cy); `r` is the coin's radius. */
function zGlyph(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  const a = 0.4 * r,
    b = 0.43 * r,
    t = 0.17 * r,
    d = 0.3 * r,
    sw = 0.09 * r,
    sh = 0.66 * r;
  g.fillStyle = color;
  g.beginPath();
  const pts = [
    [-a, -b],
    [a, -b],
    [a, -b + t],
    [-a + d, b - t],
    [a, b - t],
    [a, b],
    [-a, b],
    [-a, b - t],
    [a - d, -b + t],
    [-a, -b + t],
  ];
  pts.forEach(([x, y], i) => (i ? g.lineTo(cx + x, cy + y) : g.moveTo(cx + x, cy + y)));
  g.closePath();
  g.fill();
  g.fillRect(cx - sw, cy - sh, sw * 2, sh - b + 1);
  g.fillRect(cx - sw, cy + b - 1, sw * 2, sh - b + 1);
}

/** A gold ⓩ coin: rim, inner ring, the Z. */
function zCoin(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, z: string) {
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fillStyle = GOLD;
  g.fill();
  g.lineWidth = r * 0.08;
  g.strokeStyle = "#c98a12";
  g.stroke();
  g.beginPath();
  g.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
  g.lineWidth = r * 0.04;
  g.strokeStyle = z;
  g.stroke();
  zGlyph(g, cx, cy, r * 0.8, z);
}

/** The cards' back: deep Zcash violet, a fine gold lattice, a double gold frame and the ⓩ coin. */
function paintBack(g: CanvasRenderingContext2D, w: number, h: number) {
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#3c1a86");
  bg.addColorStop(1, "#22104e");
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(0, 0, w, h, 30);
  g.fill();
  // the lattice, inside the frame
  g.save();
  g.beginPath();
  g.roundRect(30, 30, w - 60, h - 60, 12);
  g.clip();
  g.strokeStyle = "rgba(244,183,40,0.13)";
  g.lineWidth = 2;
  const step = 28;
  for (let k = -h; k < w + h; k += step) {
    g.beginPath();
    g.moveTo(k, 0);
    g.lineTo(k + h, h);
    g.moveTo(k + h, 0);
    g.lineTo(k, h);
    g.stroke();
  }
  g.restore();
  // the frame
  g.strokeStyle = GOLD;
  g.lineWidth = 8;
  g.beginPath();
  g.roundRect(16, 16, w - 32, h - 32, 20);
  g.stroke();
  g.lineWidth = 2;
  g.globalAlpha = 0.7;
  g.beginPath();
  g.roundRect(30, 30, w - 60, h - 60, 12);
  g.stroke();
  g.globalAlpha = 1;
  // little gold diamonds in the corners
  g.fillStyle = GOLD;
  for (const [x, y] of [
    [44, 44],
    [w - 44, 44],
    [44, h - 44],
    [w - 44, h - 44],
  ]) {
    g.beginPath();
    g.moveTo(x, y - 7);
    g.lineTo(x + 7, y);
    g.lineTo(x, y + 7);
    g.lineTo(x - 7, y);
    g.closePath();
    g.fill();
  }
  // the coin, on a soft dark halo so it reads from afar
  g.beginPath();
  g.arc(w / 2, h / 2, 92, 0, Math.PI * 2);
  g.fillStyle = "rgba(20,8,48,0.55)";
  g.fill();
  zCoin(g, w / 2, h / 2, 80, "#2a1260");
}

/** A card's face: zkSNARK #id's own pixel art (or a placeholder while it loads) and its number. */
function paintFace(g: CanvasRenderingContext2D, k: number, id: number, art: HTMLImageElement | null) {
  const w = FW,
    h = FH,
    m = (w - ART) / 2;
  g.clearRect(0, 0, w, h);
  g.fillStyle = "#fff8ec";
  g.beginPath();
  g.roundRect(0, 0, w, h, 30);
  g.fill();
  // the portrait window (the art's own black background)
  g.save();
  g.beginPath();
  g.roundRect(m, m, ART, ART, 14);
  g.clip();
  g.fillStyle = "#000";
  g.fillRect(m, m, ART, ART);
  if (art) {
    g.imageSmoothingEnabled = false;
    g.drawImage(art, m, m, ART, ART);
  } else {
    g.globalAlpha = 0.22;
    zCoin(g, w / 2, m + ART / 2, 62, "#000");
    g.globalAlpha = 1;
  }
  g.restore();
  g.lineWidth = 6;
  g.strokeStyle = GOLD;
  g.beginPath();
  g.roundRect(m - 1, m - 1, ART + 2, ART + 2, 15);
  g.stroke();
  // the caption: its number on the pair's colour
  const by = m + ART + 16,
    bh = h - m - by;
  g.fillStyle = BANDS[k % BANDS.length];
  g.beginPath();
  g.roundRect(m, by, ART, bh, bh / 2);
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = INK;
  g.stroke();
  g.font = CAPTION;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineJoin = "round";
  g.lineWidth = 9;
  g.strokeStyle = INK;
  const label = `#${id}`;
  g.strokeText(label, w / 2, by + bh / 2 + 3);
  g.fillStyle = "#fff";
  g.fillText(label, w / 2, by + bh / 2 + 3);
}

interface Card {
  icon: number;
  g: THREE.Group;
  col: number;
  row: number;
  flip: number;
  target: number;
  gone: boolean;
  /** flying to a pile */
  fly: { t: number; from: THREE.Vector3; to: THREE.Vector3; owner: number } | null;
  shake: number;
  hop: number;
}

class Paires extends BaseMini {
  private cards: Card[] = [];
  private board!: THREE.Group;
  private cursor!: THREE.Mesh;
  private cursorMat!: THREE.MeshBasicMaterial;
  private cur = { c: 2, r: 1 };
  private curPos = new THREE.Vector3();
  private turn = 0;
  private picked: number[] = [];
  private wait = 0;
  private pairs = [0, 0];
  private piles = [0, 0];
  private repeat = 0;
  private lastDir = "";
  private turnClock = 0;
  private flips = 0;
  private hurried = false;
  /** CPU memory: card → flip number when last seen. */
  private seen = new Map<number, number>();
  private cpuTarget = -1;
  private cpuStepT = 0;
  private turnEl: HTMLElement | null = null;
  private ended = false;
  /** Disposed: late portraits are not painted. */
  private gone = false;
  private backTex!: THREE.Texture;
  private faceTex: THREE.Texture[] = [];
  private cardGeo = new THREE.PlaneGeometry(CW, CH);
  private edgeGeo = new THREE.BoxGeometry(CW + 0.04, CH + 0.04, 0.06);

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#ffe2c0", "#ffd0a0"], size: 12, sun: [0.4, 1, 0.9], fog: null, hemi: ["#fff1e0", "#8a6a5a", 1.6] });
    this.makeTextures();
    this.buildRoom();
    this.buildBoard();
    const sides = [-1, 1];
    this.players.forEach((p, i) => {
      const sx = sides[i];
      const a = this.spawn(i, sx * 7.2, 2.9, -sx * 0.6, { scale: 1.25 });
      a.setRing(p.char.color);
      // a little table for the pile of pairs
      cyl(this.scene, "#a8703f", 0.9, 0.08, { x: sx * 9.1, y: 1.0, z: 1.4, seg: 20 });
      cyl(this.scene, "#7a4a2a", 0.08, 1.0, { x: sx * 9.1, y: 0.5, z: 1.4, seg: 8 });
    });
    this.hud.add(
      `<style>
      .pa-turn{position:absolute;left:50%;bottom:calc(var(--u)*1.4);transform:translateX(-50%);padding:calc(var(--u)*.6) calc(var(--u)*2.2);border-radius:999px;background:var(--pc);border:calc(var(--u)*.35) solid #1d1630;font-family:var(--title);font-size:calc(var(--u)*2.4);color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.35);box-shadow:0 calc(var(--u)*.4) 0 rgba(0,0,0,.3);white-space:nowrap}
      .pa-turn .bar{position:absolute;left:8%;right:8%;bottom:calc(var(--u)*-.9);height:calc(var(--u)*.5);border-radius:9px;background:rgba(0,0,0,.35);overflow:hidden}
      .pa-turn .bar i{display:block;height:100%;background:#fff;transform-origin:left}
      </style>`,
    );
    this.turnEl = this.hud.add(`<span class="who"></span><div class="bar"><i></i></div>`, "pa-turn");
    this.hud.players(this.players, () => pairsText(0));
    this.hud.timer(TIME);
    this.setCam([0, 9, 22], [0, 3.8, 0], 42);
    this.turn = this.rnd() < 0.5 ? 0 : 1;
    this.updateTurnUi();
  }

  // ------------------------------------------------------------ textures & room

  private makeTextures() {
    this.backTex = canvasTex(FW, FH, paintBack);
    // (10 zkSNARKs drawn by the seed, never the players' own)
    const ids = rivalIds(PAIRS, this.rnd, this.players.map((p) => p.char.snark));
    ids.forEach((id, k) => this.faceTex.push(this.faceOf(k, id)));
  }

  /** Pair k's face: a placeholder at once, zkSNARK #id's art painted in when it has loaded. */
  private faceOf(k: number, id: number): THREE.Texture {
    let cv: HTMLCanvasElement | null = null;
    const tex = canvasTex(FW, FH, (g) => {
      cv = g.canvas;
      paintFace(g, k, id, null);
    });
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    const repaint = () => {
      const g = cv?.getContext("2d");
      if (!g || this.gone) return;
      paintFace(g, k, id, img.complete && img.naturalWidth > 0 ? img : null);
      tex.needsUpdate = true;
    };
    img.onload = repaint;
    img.src = personImage(id);
    // (the caption's font may arrive after the first paint)
    document.fonts?.load(CAPTION).then(repaint, () => {});
    return tex;
  }

  private buildRoom() {
    const s = this.scene;
    const wood = canvasTex(
      256,
      256,
      (g, w) => {
        for (let k = 0; k < 8; k++) {
          g.fillStyle = k % 2 ? "#b8804a" : "#a8703f";
          g.fillRect(0, (k * w) / 8, w, w / 8);
          g.fillStyle = "rgba(0,0,0,0.12)";
          g.fillRect(0, (k * w) / 8, w, 3);
          g.fillRect(((k * 97) % w) | 0, (k * w) / 8, 3, w / 8);
        }
      },
      true,
    );
    wood.repeat.set(6, 6);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), new THREE.MeshToonMaterial({ map: wood }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);
    const rug = new THREE.Mesh(new THREE.CircleGeometry(6.5, 40), toon("#c8402c"));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.01, 2.5);
    rug.scale.set(1.5, 0.6, 1);
    s.add(rug);
    const rug2 = new THREE.Mesh(new THREE.RingGeometry(5.9, 6.2, 40), toon("#ffd23f"));
    rug2.rotation.x = -Math.PI / 2;
    rug2.position.set(0, 0.02, 2.5);
    rug2.scale.set(1.5, 0.6, 1);
    s.add(rug2);
    // wallpaper with a world map poster and windows
    const paper = canvasTex(
      128,
      128,
      (g, w) => {
        g.fillStyle = "#2f6a6a";
        g.fillRect(0, 0, w, w);
        g.fillStyle = "#3a7a78";
        for (let x = 0; x < 4; x++) g.fillRect(x * 32 + 12, 0, 8, w);
        g.fillStyle = "#e8c070";
        for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) g.fillRect(x * 32 + 14, y * 32 + 14, 4, 4);
      },
      true,
    );
    paper.repeat.set(10, 3);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(40, 14), new THREE.MeshToonMaterial({ map: paper }));
    wall.position.set(0, 7, -5);
    s.add(wall);
    box(s, "#f4efe6", 40, 1.0, 0.2, { y: 0.5, z: -4.9 });
    for (const x of [-12.5, 12.5]) {
      const win = group(s, { x, y: 6.5, z: -4.9 });
      box(win, "#a8dcff", 4, 5, 0.05, { cast: false });
      // a skyline in the window
      for (let k = 0; k < 5; k++) box(win, "#8aa8c8", 0.7, 1 + (k % 3) * 0.7, 0.06, { x: -1.5 + k * 0.75, y: -2.5 + (0.5 + (k % 3) * 0.35), z: 0.02, cast: false });
      box(win, "#f4efe6", 4.4, 0.25, 0.2, { y: 2.6 });
      box(win, "#f4efe6", 4.4, 0.25, 0.2, { y: -2.6 });
      box(win, "#f4efe6", 0.25, 5.4, 0.2, { x: 2.1 });
      box(win, "#f4efe6", 0.25, 5.4, 0.2, { x: -2.1 });
      box(win, "#f4efe6", 0.15, 5, 0.15);
      box(win, "#d8402c", 1.2, 5.6, 0.1, { x: -2.7, z: 0.15 });
      box(win, "#d8402c", 1.2, 5.6, 0.1, { x: 2.7, z: 0.15 });
    }
    // a globe and suitcases
    const gl = group(s, { x: -10.5, z: 0.5 });
    cyl(gl, "#7a4a2a", 0.5, 0.15, { y: 0.08, seg: 16 });
    cyl(gl, "#7a4a2a", 0.06, 1.3, { y: 0.7, seg: 8 });
    ball(gl, "#3a9ae8", 0.75, { y: 1.9 });
    ball(gl, "#4fbf4a", [0.42, 0.5, 0.3], { y: 2.0, x: 0.35, z: 0.4 });
    ball(gl, "#4fbf4a", [0.3, 0.3, 0.32], { y: 1.75, x: -0.5, z: 0.3 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.04, 6, 32), toon("#ffc928"));
    ring.position.y = 1.9;
    ring.rotation.z = 0.4;
    gl.add(ring);
    for (const [x, z, w, h, d, c, ry] of [
      [10.2, 0.4, 2.0, 1.3, 0.8, "#c8402c", 0.2],
      [10.6, 0.6, 1.6, 1.0, 0.7, "#2f8dff", -0.1],
      [11.6, -1.6, 1.4, 2.0, 0.8, "#ffc928", 0.4],
    ] as const) {
      const sc = group(s, { x, z, ry });
      box(sc, c, w, h, d, { y: h / 2 + (c === "#2f8dff" ? 1.3 : 0) });
      box(sc, "#5a3a2a", 0.5, 0.12, 0.12, { y: h + 0.06 + (c === "#2f8dff" ? 1.3 : 0) });
    }
    // plants
    for (const x of [-15, 15]) {
      cyl(s, "#d8884a", 0.6, 1.0, { x, y: 0.5, z: -3, rTop: 0.75, seg: 14 });
      for (let k = 0; k < 5; k++) cone(s, "#3fae4a", 0.25, 2 + (k % 2), { x: x + Math.cos(k * 1.3) * 0.3, y: 1.8, z: -3 + Math.sin(k * 1.3) * 0.3, rz: Math.cos(k * 1.3) * 0.3, rx: Math.sin(k * 1.3) * 0.3, lo: true });
    }
  }

  private buildBoard() {
    this.board = group(this.scene, { y: BOARD_Y, z: BOARD_Z, rx: BOARD_TILT });
    const w = COLS * GX + 0.9,
      h = ROWS * GY + 0.9;
    box(this.board, "#7a4a2a", w + 0.5, h + 0.5, 0.3, { z: -0.25 });
    box(this.board, "#17142e", w, h, 0.1, { z: -0.08 });
    // easel legs
    for (const sx of [-1, 1]) {
      const leg = box(this.scene, "#7a4a2a", 0.35, BOARD_Y + 1, 0.35, { x: sx * (w / 2 - 0.3), y: (BOARD_Y - 0.5) / 2, z: BOARD_Z - 1.2, rx: -0.12 });
      void leg;
    }
    const backMat = new THREE.MeshToonMaterial({ map: this.backTex });
    const faceMats = this.faceTex.map((t) => new THREE.MeshToonMaterial({ map: t }));
    const edgeMat = toon("#f4efe6");
    const icons: number[] = [];
    for (let k = 0; k < PAIRS; k++) icons.push(k, k);
    for (let i = icons.length - 1; i > 0; i--) {
      const j = Math.floor(this.rnd() * (i + 1));
      [icons[i], icons[j]] = [icons[j], icons[i]];
    }
    icons.forEach((icon, n) => {
      const col = n % COLS,
        row = Math.floor(n / COLS);
      const g = group(this.board, { x: (col - (COLS - 1) / 2) * GX, y: ((ROWS - 1) / 2 - row) * GY, z: 0.12 });
      const edge = new THREE.Mesh(this.edgeGeo, edgeMat);
      edge.castShadow = true;
      g.add(edge);
      const back = new THREE.Mesh(this.cardGeo, backMat);
      back.position.z = 0.035;
      g.add(back);
      const face = new THREE.Mesh(this.cardGeo, faceMats[icon]);
      face.position.z = -0.035;
      face.rotation.y = Math.PI;
      g.add(face);
      this.cards.push({ icon, g, col, row, flip: 0, target: 0, gone: false, fly: null, shake: 0, hop: 0 });
    });
    // the cursor: a glowing frame
    const frameTex = canvasTex(128, 160, (g, w, h) => {
      g.strokeStyle = "#ffffff";
      g.lineWidth = 12;
      g.beginPath();
      g.roundRect(8, 8, w - 16, h - 16, 16);
      g.stroke();
    });
    this.cursorMat = new THREE.MeshBasicMaterial({ map: frameTex, transparent: true, depthWrite: false, color: "#ffffff" });
    this.cursor = new THREE.Mesh(new THREE.PlaneGeometry(CW + 0.5, CH + 0.5), this.cursorMat);
    this.cursor.renderOrder = 3;
    this.board.add(this.cursor);
  }

  private cardAt(c: number, r: number) {
    return this.cards.findIndex((k) => k.col === c && k.row === r);
  }
  private cardLocal(c: number, r: number) {
    return new THREE.Vector3((c - (COLS - 1) / 2) * GX, ((ROWS - 1) / 2 - r) * GY, 0.12);
  }

  // ------------------------------------------------------------ turns

  private updateTurnUi() {
    const p = this.players[this.turn];
    if (this.turnEl) {
      this.turnEl.style.setProperty("--pc", p.char.color);
      (this.turnEl.querySelector(".who") as HTMLElement).textContent = T(`${p.name}'s turn`, `轮到 ${p.name}`);
    }
    this.cursorMat.color.set(p.char.color);
    this.players.forEach((_, i) => this.hud.mark(i, "hot", i === this.turn));
  }

  private passTurn() {
    this.turn = 1 - this.turn;
    this.turnClock = 0;
    this.cpuTarget = -1;
    this.updateTurnUi();
    this.sound("whoosh");
    this.hud.banner(T(`${this.players[this.turn].name}, your turn!`, `${this.players[this.turn].name}，轮到你！`), { color: this.players[this.turn].char.color, size: 5.5, ms: 800 });
  }

  // ------------------------------------------------------------ CPU

  private recalls(i: number, card: number) {
    const at = this.seen.get(card);
    if (at === undefined) return false;
    const lv = this.players[i].level;
    const age = this.flips - at;
    const p = (0.55 + 0.45 * lv) * Math.exp(-age / (3 + 14 * lv * lv));
    return Math.random() < p;
  }

  private cpuChoose(i: number): number {
    const live = this.cards.map((c, k) => ({ c, k })).filter((o) => !o.c.gone && o.c.target === 0 && !this.picked.includes(o.k));
    const remembered = live.filter((o) => this.recalls(i, o.k));
    if (this.picked.length === 1) {
      const first = this.cards[this.picked[0]];
      const mate = remembered.find((o) => o.c.icon === first.icon);
      if (mate) return mate.k;
    } else {
      // a pair it remembers both halves of
      for (const a of remembered) {
        const b = remembered.find((o) => o.k !== a.k && o.c.icon === a.c.icon);
        if (b) return a.k;
      }
    }
    // otherwise an unseen card if possible
    const unseen = live.filter((o) => !this.seen.has(o.k));
    const pool = unseen.length ? unseen : live.filter((o) => !remembered.some((r) => r.k === o.k)).length ? live.filter((o) => !remembered.some((r) => r.k === o.k)) : live;
    return pool[Math.floor(Math.random() * pool.length)].k;
  }

  protected cpu(i: number, dt: number): CpuPad {
    if (i !== this.turn || this.wait > 0 || this.ended || this.picked.length >= 2) return {};
    const lv = this.players[i].level;
    if (this.cpuTarget < 0 || this.cards[this.cpuTarget].gone) {
      if (!this.cpuAfter(i, "think", 0.2 + (1 - lv) * 0.25 + Math.random() * 0.15)) return {};
      this.cpuReset(i, "think");
      this.cpuTarget = this.cpuChoose(i);
      this.cpuStepT = 0;
    }
    const t = this.cards[this.cpuTarget];
    this.cpuStepT -= dt;
    if (t.col === this.cur.c && t.row === this.cur.r) {
      if (this.cpuStepT > 0) return {};
      return { a: true };
    }
    if (this.cpuStepT > 0) return {};
    this.cpuStepT = 0.09 + (1 - lv) * 0.06;
    const dx = Math.sign(t.col - this.cur.c),
      dy = Math.sign(t.row - this.cur.r);
    return dx !== 0 ? { x: dx } : { y: dy };
  }

  // ------------------------------------------------------------ the game

  protected idle(dt: number) {
    this.moveCam([0, 6.5, 17.2], [0, 3.62, -0.6], dt, 1.4);
    this.placeCursor(dt);
    this.animCards(dt);
  }

  protected step(dt: number) {
    const left = TIME - this.t;
    this.hud.timer(left);
    this.moveCam([0, 6.5, 17.2], [0, 3.62, -0.6], dt, 3);
    if (!this.hurried && left <= 15) {
      this.hurried = true;
      this.hud.banner(T("15 SECONDS LEFT!", "还剩 15 秒！"), { color: "#ffd23f", size: 6 });
      music.speed(1.15);
    }
    // the turn clock (a slow player loses the turn)
    if (this.wait <= 0 && !this.ended) {
      this.turnClock += dt;
      const bar = this.turnEl?.querySelector(".bar i") as HTMLElement | null;
      if (bar) bar.style.transform = `scaleX(${clamp(1 - this.turnClock / TURN_T, 0, 1)})`;
      if (this.turnClock > TURN_T) {
        this.hud.pop(this.avatars[this.turn].pos.clone().setY(2.4), T("Too slow!", "太慢了！"), "#ff8a7a", this.camera);
        for (const k of this.picked) this.cards[k].target = 0;
        this.picked = [];
        this.passTurn();
      }
    }
    if (this.wait > 0) {
      this.wait -= dt;
      if (this.wait <= 0) this.resolve();
    } else if (!this.ended) {
      this.moveCursor(dt);
      if (this.pad(this.turn).aDown) this.tryFlip();
    }
    this.placeCursor(dt);
    this.animCards(dt);
    this.avatars.forEach((a, i) => {
      a.faceTo(i === this.turn ? this.curPos.x : 0, BOARD_Z, dt, 6);
      if (a.anim === "idle" || a.anim === "hold") a.anim = i === this.turn ? "hold" : "idle";
    });
    if (!this.ended && (left <= 0 || this.cards.every((c) => c.gone))) {
      this.ended = true;
      this.cursor.visible = false;
      this.turnEl?.remove();
      this.turnEl = null;
      this.hud.mark(0, "hot", false);
      this.hud.mark(1, "hot", false);
      this.finishByScore(this.pairs);
    }
  }

  private moveCursor(dt: number) {
    const p = this.pad(this.turn);
    let dir = "";
    if (Math.abs(p.x) > 0.5 && Math.abs(p.x) >= Math.abs(p.y)) dir = p.x > 0 ? "r" : "l";
    else if (Math.abs(p.y) > 0.5) dir = p.y > 0 ? "d" : "u";
    if (!dir) {
      this.lastDir = "";
      return;
    }
    this.repeat -= dt;
    if (dir === this.lastDir && this.repeat > 0) return;
    this.repeat = dir === this.lastDir ? 0.13 : 0.3;
    this.lastDir = dir;
    const c = clamp(this.cur.c + (dir === "r" ? 1 : dir === "l" ? -1 : 0), 0, COLS - 1);
    const r = clamp(this.cur.r + (dir === "d" ? 1 : dir === "u" ? -1 : 0), 0, ROWS - 1);
    if (c !== this.cur.c || r !== this.cur.r) {
      this.cur = { c, r };
      this.sound("select");
    }
  }

  private placeCursor(dt: number) {
    const target = this.cardLocal(this.cur.c, this.cur.r);
    const k = 1 - Math.exp(-20 * dt);
    this.cursor.position.lerp(target.setZ(0.32), k);
    const s = 1 + Math.sin(this.t * 7) * 0.035;
    this.cursor.scale.set(s, s, 1);
    this.curPos.copy(this.cursor.position);
    this.board.localToWorld(this.curPos);
    this.cursor.visible = !this.ended;
  }

  private tryFlip() {
    const k = this.cardAt(this.cur.c, this.cur.r);
    if (k < 0) return;
    const c = this.cards[k];
    if (c.gone || c.target === 1 || this.picked.includes(k)) {
      this.sound("back");
      c.shake = 0.3;
      return;
    }
    c.target = 1;
    this.picked.push(k);
    this.flips++;
    this.seen.set(k, this.flips);
    this.sound("swing");
    this.turnClock = 0;
    this.cpuTarget = -1;
    this.avatars[this.turn].anim = "throw";
    setTimeout(() => {
      const a = this.avatars[this.turn];
      if (a && a.anim === "throw") a.anim = "hold";
    }, 300);
    if (this.picked.length === 2) this.wait = 0.85;
  }

  private resolve() {
    const [a, b] = this.picked.map((k) => this.cards[k]);
    this.picked = [];
    if (a.icon === b.icon) {
      // a pair: off to the player's pile
      const i = this.turn;
      this.pairs[i]++;
      this.hud.setScore(this.players[i].i, pairsText(this.pairs[i]));
      const sx = i === 0 ? -1 : 1;
      for (const c of [a, b]) {
        const from = c.g.getWorldPosition(new THREE.Vector3());
        const to = new THREE.Vector3(sx * 9.1 + (c === a ? -0.25 : 0.25), 1.1 + this.piles[i] * 0.05, 1.4);
        this.board.remove(c.g);
        this.scene.add(c.g);
        c.g.position.copy(from);
        c.fly = { t: 0, from, to, owner: i };
        c.gone = true;
        this.fx.sparkle(from, this.players[i].char.color, 14);
      }
      this.piles[i]++;
      this.sound("coins");
      this.fx.confetti(this.avatars[i].pos.clone().setY(2), 24);
      this.hud.pop(this.avatars[i].pos.clone().setY(2.6), "+1", "#ffe14a", this.camera);
      this.avatars[i].anim = "win";
      setTimeout(() => {
        const av = this.avatars[i];
        if (av && av.anim === "win" && !this.finished) av.anim = "hold";
      }, 900);
      this.buzz(i, [40, 30, 40]);
      this.turnClock = 0;
      this.cpuTarget = -1;
      if (!this.cards.every((c) => c.gone)) this.hud.banner(T("PAIR!", "配对！"), { color: "#ffd23f", size: 6, ms: 600 });
    } else {
      a.target = 0;
      b.target = 0;
      a.shake = b.shake = 0.35;
      this.sound("wrong");
      this.passTurn();
    }
  }

  private animCards(dt: number) {
    for (const c of this.cards) {
      if (c.fly) {
        c.fly.t = Math.min(1, c.fly.t + dt * 1.6);
        const e = easeInOutCubic(c.fly.t);
        c.g.position.lerpVectors(c.fly.from, c.fly.to, e);
        c.g.position.y += Math.sin(Math.PI * e) * 2.5;
        c.g.rotation.set(-Math.PI / 2 * e + BOARD_TILT * (1 - e), Math.PI, c.fly.t * Math.PI * 2 * (1 - e));
        c.g.scale.setScalar(1 - 0.55 * e);
        continue;
      }
      if (c.gone) continue;
      const prev = c.flip;
      c.flip += (c.target - c.flip) * Math.min(1, dt * 9);
      if (Math.abs(c.target - c.flip) < 0.002) c.flip = c.target;
      const lift = Math.sin(Math.PI * c.flip) * 0.9;
      const base = this.cardLocal(c.col, c.row);
      const sel = c.col === this.cur.c && c.row === this.cur.r && !this.ended ? 0.12 : 0;
      c.shake = Math.max(0, c.shake - dt);
      c.g.position.set(base.x + Math.sin(this.t * 50) * c.shake * 0.25, base.y, base.z + lift + sel);
      c.g.rotation.y = easeOutBack(clamp(c.flip, 0, 1)) * Math.PI;
      void prev;
    }
  }

  protected outroStep(dt: number) {
    this.animCards(dt);
  }

  dispose() {
    this.gone = true;
    this.cardGeo.dispose();
    this.edgeGeo.dispose();
    super.dispose();
  }
}

/** "1 pair", "2 pairs" / "2 对". */
const pairsText = (n: number) => T(`${n} pair${n === 1 ? "" : "s"}`, `${n} 对`);

const def: MiniDef = {
  id: "paires",
  name: "ZK Memo",
  icon: "🃏",
  color: "#8a5cff",
  tagline: "Turn the cards, find the most zkSNARK pairs.",
  rules: "Turn by turn, move the cursor and flip two cards (A). A pair of zkSNARKs scores 1 and you play again; else it's the other's turn. Most pairs wins!",
  controls: { stick: "Move the cursor", a: "Flip a card" },
  modes: ["duel"],
  length: 75,
  music: "london",
  create: (ctx) => new Paires(ctx),
};
export default def;
