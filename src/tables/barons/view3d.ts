/**
 * BLOCK BARONS in 3D: a printed board on a walnut table under one warm lamp, in the dark of the
 * Game House. Card-stock spaces with their district bands, a void middle printed with a dot grid,
 * a felt dice tray, the two decks, the bank's chip rack; the barons as their zkSNARKs on
 * enamel bases (they hop space to space), ivory dice that are thrown and bounce off the tray's
 * walls (a small rigid-body simulation, relabelled to land on the rolled faces), owners' portrait
 * coins, wooden houses that rise on the district bands (a Foundry crowns four), and clay credit
 * chips flying between players.
 *
 * Every animation is a promise (the table awaits them); `speed` scales them all.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Avatar, Fx3, CamRig, block, disposeScene, glow, outline, GEO } from "../../party/k3";
import type { Player } from "../../party/kit";
import { personImage } from "../../party/people";
import type { TableSeat } from "../types";
import { GROUPS, JAIL, N, PARK, SPACES } from "./board";
import { CHIP_COLORS, FLARE, paintCardBack, paintCentre, paintChipEdge, paintChipFace, paintCoin, paintDie, paintPledged, paintSpace, paperFill, fontsReady } from "./art";

export const TW = 1; // an edge space's width along the edge
export const TC = 1.6; // its depth (and a corner's side)
const L = 2 * TC + 9 * TW;
const HALF = L / 2;
const TH = 0.12; // the board's printed face (y)
const MARGIN = 0.34; // the board's dark border round the track
const B = L + 2 * MARGIN;
const INNER = L - 2 * TC; // the middle's side
// the dice tray in the middle (its inside), the decks beside it, the bank's rack behind it
const TRAY_W = 3.5;
const TRAY_D = 2.5;
const FELT = TH + 0.035;
const WALL_H = 0.24;
const DECK_X = 3.0;
const RACK_Z = -2.78;
const DIE = 0.36;

interface Frame {
  x: number;
  z: number;
  rot: number;
  corner: boolean;
}

/** A space's centre and the turn that points its printed top toward the board's middle. */
export function frameOf(i: number): Frame {
  const side = Math.floor(i / 10),
    k = i % 10;
  const e = HALF - TC / 2;
  if (k === 0) {
    const pos = [
      [e, e],
      [-e, e],
      [-e, -e],
      [e, -e],
    ][side];
    return { x: pos[0], z: pos[1], rot: [0, 0, Math.PI, Math.PI][side], corner: true };
  }
  const d = HALF - TC - (k - 0.5) * TW;
  switch (side) {
    case 0:
      return { x: d, z: e, rot: 0, corner: false };
    case 1:
      return { x: -e, z: d, rot: -Math.PI / 2, corner: false };
    case 2:
      return { x: -d, z: -e, rot: Math.PI, corner: false };
    default:
      return { x: e, z: -d, rot: Math.PI / 2, corner: false };
  }
}

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
/** The board's corners at its face and at a pawn's height, for fitting the whole of it to the screen. */
const CORNERS = [-1, 1].flatMap((x) => [-1, 1].flatMap((z) => [0, 0.9].map((y) => new THREE.Vector3((x * B) / 2, TH + y, (z * B) / 2))));
const fitDir = new THREE.Vector3();
const fitFwd = new THREE.Vector3();
const fitRight = new THREE.Vector3();
const fitUp = new THREE.Vector3();
const fitEye = new THREE.Vector3();
const fitAt = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
/** A space-local point (x along the edge, z outward) to the world, on the board's face. */
function local(i: number, lx: number, lz: number, out = new THREE.Vector3(), y = TH) {
  const f = frameOf(i);
  const c = Math.cos(f.rot),
    s = Math.sin(f.rot);
  out.set(f.x + lx * c + lz * s, y, f.z - lx * s + lz * c);
  return out;
}

/** Where the k-th of n pawns stands on a space (jailed: inside the cell). */
function slotOf(i: number, k: number, n: number, jailed: boolean, out: THREE.Vector3) {
  const f = frameOf(i);
  if (i === JAIL) {
    if (jailed) {
      const col = k % 3,
        row = Math.floor(k / 3);
      return local(i, -0.08 + col * 0.24, -0.62 + row * 0.24, out);
    }
    const p = [
      [-0.55, 0.55],
      [-0.2, 0.62],
      [0.15, 0.62],
      [0.5, 0.62],
      [-0.62, 0.2],
      [-0.62, -0.15],
      [-0.62, -0.5],
      [0.5, 0.3],
    ][k % 8];
    return local(i, p[0], p[1], out);
  }
  if (f.corner) {
    if (n === 1) return local(i, 0, 0.25, out);
    const col = k % 3,
      row = Math.floor(k / 3);
    return local(i, (col - 1) * 0.4, -0.05 + row * 0.36, out);
  }
  if (n === 1) return local(i, 0, 0.3, out);
  if (n === 2) return local(i, k ? 0.2 : -0.2, 0.3, out);
  const col = k % 2,
    row = Math.floor(k / 2);
  const rows = Math.ceil(n / 2);
  return local(i, col ? 0.21 : -0.21, 0.26 + (row - (rows - 1) / 2) * 0.26, out);
}

interface Tween {
  t: number;
  d: number;
  f: (k: number) => void;
  done: () => void;
  /** A plain pause: nothing on the board moves. */
  still: boolean;
}
const noop = () => {};

interface Pawn {
  seat: number;
  av: Avatar;
  space: number;
  jailed: boolean;
  out: boolean;
  home: THREE.Vector3;
  hopping: boolean;
  base: THREE.Group;
}

interface Chip {
  m: THREE.Mesh;
  a: THREE.Vector3;
  b: THREE.Vector3;
  t: number;
  d: number;
  live: boolean;
  spin: number;
}

/** A die's recorded throw: positions and orientations at 120 Hz, the sounds along the way. */
interface Throw {
  n: number;
  pos: Float32Array[];
  rot: Float32Array[];
  fix: THREE.Quaternion[];
  hits: { f: number; kind: "floor" | "wall" | "dice"; s: number }[];
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const backOut = (t: number) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export interface ViewOpts {
  seats: TableSeat[];
  names: (i: number) => [string, string];
  deckNames: [string, string];
  title: string;
  tagline: string;
  bank: string;
}

export type Focus = { k: "over" } | { k: "pawn"; seat: number } | { k: "space"; i: number } | { k: "roll"; seat: number };

export class BoardView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.1, 300);
  readonly cam: CamRig;
  readonly canvas: HTMLCanvasElement;
  /** 1 normal, more: faster (fast-forward), huge: the bench's `fast`. */
  speed = 1;
  private lowEnd: boolean;
  private tiles: THREE.Mesh[] = [];
  private tileMats: THREE.MeshStandardMaterial[] = [];
  private tileCanvases: HTMLCanvasElement[] = [];
  private coins: (THREE.Mesh | null)[] = [];
  private coinOwner: number[] = [];
  private bars: (THREE.Mesh | null)[] = [];
  private pledged: (THREE.Mesh | null)[] = [];
  private builds: THREE.Group[] = [];
  private levels: number[] = [];
  private smoke: { at: THREE.Vector3; t: number }[] = [];
  private pawns: Pawn[] = [];
  private tweens: Tween[] = [];
  private dice: THREE.Mesh[] = [];
  private dieMats: THREE.Material[] = [];
  private roll: { th: Throw; t: number; f: number; hit: number; resolve: (() => void) | null; onHit: ((kind: "floor" | "wall" | "dice", s: number, first: boolean) => void) | null; first: boolean } | null = null;
  private chips: Chip[] = [];
  private fx: Fx3;
  private active = -1;
  private activeRing: THREE.Mesh;
  private activePool: THREE.Mesh;
  private potStack: THREE.Mesh;
  private potEdge: THREE.Texture;
  private potLabel: THREE.Mesh;
  private potCv: HTMLCanvasElement;
  private potTex: THREE.CanvasTexture;
  private hover = -1;
  private raf = 0;
  private last = 0;
  private time = 0;
  private ro: ResizeObserver;
  private insets = { left: 0, right: 0, top: 0, bottom: 0 };
  private focusMode: Focus = { k: "over" };
  private eye = new THREE.Vector3();
  private at = new THREE.Vector3();
  /** The player's own turn of the camera (drag) and zoom (wheel, pinch). */
  private orbit = 0;
  private zoom = 1;
  private overYaw = 0;
  /** A touch screen: an upright one sees the whole board from higher up, fitted to the room left (target()). */
  private coarse = matchMedia("(pointer: coarse)").matches;
  onPick: ((i: number) => void) | null = null;
  readonly colors: string[];
  private deckMeshes: THREE.Group[] = [];
  private coinTex: THREE.CanvasTexture[] = [];
  private coinBack: THREE.MeshStandardMaterial;
  private shadowsDirty = true;

  constructor(
    host: HTMLElement,
    private o: ViewOpts,
  ) {
    this.colors = o.seats.map((s) => s.color);
    this.lowEnd = matchMedia("(pointer: coarse)").matches || Math.min(window.innerWidth, window.innerHeight) < 600;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(this.lowEnd ? 1.75 : 2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.canvas = this.renderer.domElement;
    this.canvas.className = "bb-canvas";
    host.appendChild(this.canvas);
    this.cam = new CamRig(this.camera);
    this.buildRoom();
    this.buildBoard();
    this.buildMiddle();
    this.fx = new Fx3(this.scene, 500);
    this.coinBack = new THREE.MeshStandardMaterial({ color: "#6d6862", roughness: 0.45, metalness: 0.2 });
    this.makeCoinTextures();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.245, 40), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 3;
    ring.visible = false;
    this.scene.add(ring);
    this.activeRing = ring;
    const pool = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: this.poolTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: "#ffffff" }));
    pool.rotation.x = -Math.PI / 2;
    pool.scale.setScalar(1.25);
    pool.renderOrder = 2;
    pool.visible = false;
    this.scene.add(pool);
    this.activePool = pool;
    // CENTRAL PARK's pot: a stack of chips and a paper tag
    const edgeCv = document.createElement("canvas");
    paintChipEdge(edgeCv, CHIP_COLORS[3]);
    this.potEdge = new THREE.CanvasTexture(edgeCv);
    this.potEdge.colorSpace = THREE.SRGBColorSpace;
    this.potEdge.wrapS = this.potEdge.wrapT = THREE.RepeatWrapping;
    this.potStack = this.chipStack(CHIP_COLORS[3], 1, this.potEdge);
    this.potStack.position.copy(local(PARK, 0.42, -0.42, tmpV, TH));
    this.potStack.visible = false;
    this.scene.add(this.potStack);
    this.potCv = document.createElement("canvas");
    this.potCv.width = 256;
    this.potCv.height = 112;
    this.potTex = new THREE.CanvasTexture(this.potCv);
    this.potTex.colorSpace = THREE.SRGBColorSpace;
    this.potLabel = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: this.potTex, transparent: true, depthWrite: false }));
    this.potLabel.scale.set(0.82, 0.36, 1);
    this.potLabel.position.copy(local(PARK, 0.42, -0.42, tmpV, TH + 0.95));
    this.potLabel.renderOrder = 5;
    this.scene.add(this.potLabel);
    this.setPot(0);
    this.makeDice();
    this.makeChips();
    for (const s of o.seats) this.addPawn(s);
    this.layout(0);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    // the opening shot: high above, a quarter turn round, settling over the table
    this.snapCamera();
    const d = this.overDist();
    this.cam.set(new THREE.Vector3(Math.sin(0.7) * d * 0.75, d * 0.95, Math.cos(0.7) * d * 0.75), new THREE.Vector3(0, 0, 0));
    this.bindInput();
    // (the display face may arrive after the first paint: print the spaces again with it)
    void fontsReady().then(() => {
      if (!this.raf) return;
      this.printSpaces();
      this.printMiddle();
    });
    this.last = performance.now();
    const loop = (t: number) => {
      this.raf = requestAnimationFrame(loop);
      // (a frame's timestamp is when the frame began, which can be before the long task that built
      // the table ended: never a negative step, the camera's easing would fling it away)
      const dt = Math.max(0, Math.min(0.1, (t - this.last) / 1000));
      this.last = t;
      this.frame(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  // ---- the room ----------------------------------------------------------------------------------

  /** The dark hall round the table, the walnut table, the lamp. */
  private buildRoom() {
    const s = this.scene;
    // the hall: dark warm walls, a few out-of-focus lights of the other tables
    const cv = document.createElement("canvas");
    cv.width = 1024;
    cv.height = 512;
    const g = cv.getContext("2d")!;
    const gr = g.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, "#050404");
    gr.addColorStop(0.42, "#0d0a09");
    gr.addColorStop(0.55, "#17110e");
    gr.addColorStop(1, "#070605");
    g.fillStyle = gr;
    g.fillRect(0, 0, 1024, 512);
    let seed = 7;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const bokeh = ["#ff6b35", "#d9bc8a", "#c4b1fc", "#a8d8e8", "#ffb38a"];
    for (let k = 0; k < 26; k++) {
      const x = r() * 1024,
        y = 205 + r() * 70,
        rad = 6 + r() * 22;
      const c = bokeh[k % bokeh.length];
      const b = g.createRadialGradient(x, y, 0, x, y, rad);
      b.addColorStop(0, c + "55");
      b.addColorStop(0.6, c + "22");
      b.addColorStop(1, c + "00");
      g.fillStyle = b;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // the other tables' lamps: soft warm pools far away
    for (let k = 0; k < 5; k++) {
      const x = 100 + k * 205 + r() * 40,
        y = 262;
      const b = g.createRadialGradient(x, y, 0, x, y, 120);
      b.addColorStop(0, "rgba(255,190,130,0.10)");
      b.addColorStop(1, "rgba(255,190,130,0)");
      g.fillStyle = b;
      g.fillRect(x - 120, y - 120, 240, 240);
    }
    const bt = new THREE.CanvasTexture(cv);
    bt.colorSpace = THREE.SRGBColorSpace;
    const hall = new THREE.Mesh(new THREE.SphereGeometry(90, 32, 16), new THREE.MeshBasicMaterial({ map: bt, side: THREE.BackSide, fog: false, depthWrite: false }));
    hall.raycast = () => {};
    s.add(hall);
    s.background = new THREE.Color("#070605");
    s.fog = new THREE.Fog("#0a0807", 48, 95);
    // the table: walnut planks
    const wood = document.createElement("canvas");
    wood.width = wood.height = 1024;
    this.paintWood(wood);
    const wt = new THREE.CanvasTexture(wood);
    wt.colorSpace = THREE.SRGBColorSpace;
    wt.anisotropy = 8;
    const top = new THREE.MeshStandardMaterial({ map: wt, roughness: 0.48, metalness: 0 });
    const edge = new THREE.MeshStandardMaterial({ color: "#1d130d", roughness: 0.55 });
    const tg = new THREE.CylinderGeometry(16, 16, 0.6, 72);
    tg.groups.pop();
    const table = new THREE.Mesh(tg, [edge, top]);
    table.position.y = -0.08 - 0.3;
    table.receiveShadow = true;
    table.raycast = () => {};
    s.add(table);
    // light: a warm lamp over the board, a low hall glow, a cool lilac rim from the far side
    s.add(new THREE.HemisphereLight("#f2e3d2", "#140e0b", 0.7));
    const spot = new THREE.SpotLight("#ffe0bd", 4.2, 0, 0.6, 0.8, 0);
    spot.position.set(1.6, 19, 6.5);
    spot.target.position.set(0, 0, 0.4);
    spot.castShadow = true;
    spot.shadow.mapSize.set(this.lowEnd ? 1024 : 2048, this.lowEnd ? 1024 : 2048);
    spot.shadow.bias = -0.0004;
    spot.shadow.normalBias = 0.025;
    spot.shadow.camera.near = 10;
    spot.shadow.camera.far = 30;
    spot.shadow.radius = 3;
    s.add(spot, spot.target);
    const rim = new THREE.DirectionalLight("#c4b1fc", 0.55);
    rim.position.set(-9, 7, -12);
    s.add(rim);
    const fill = new THREE.DirectionalLight("#ffd9b8", 0.35);
    fill.position.set(8, 6, 10);
    s.add(fill);
  }

  private paintWood(cv: HTMLCanvasElement) {
    const g = cv.getContext("2d")!;
    const S = cv.width;
    let seed = 99;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const planks = 7;
    const ph = S / planks;
    const tones = ["#3a2618", "#33210f", "#402a1b", "#2e1e13", "#3b2717", "#36231a", "#2f1f14"];
    for (let p = 0; p < planks; p++) {
      const y0 = p * ph;
      g.fillStyle = tones[p % tones.length];
      g.fillRect(0, y0, S, ph);
      // the grain: long wavy streaks, light and dark
      for (let k = 0; k < 70; k++) {
        const yy = y0 + r() * ph;
        const amp = 2 + r() * 6;
        const fr = 0.004 + r() * 0.01;
        const ph0 = r() * 10;
        g.strokeStyle = r() < 0.55 ? `rgba(20,10,4,${0.12 + r() * 0.2})` : `rgba(140,96,60,${0.05 + r() * 0.1})`;
        g.lineWidth = 0.6 + r() * 2.2;
        g.beginPath();
        for (let x = 0; x <= S; x += 16) {
          const y = yy + Math.sin(x * fr + ph0) * amp + Math.sin(x * fr * 3.1 + ph0 * 2) * amp * 0.3;
          if (x === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      }
      // a knot or two
      if (r() < 0.7) {
        const kx = r() * S,
          ky = y0 + ph * (0.3 + r() * 0.4);
        for (let k = 6; k > 0; k--) {
          g.strokeStyle = `rgba(20,10,4,${0.12 + k * 0.03})`;
          g.lineWidth = 1.5;
          g.beginPath();
          g.ellipse(kx, ky, k * 7, k * 2.6, 0, 0, Math.PI * 2);
          g.stroke();
        }
      }
      // the seam between planks
      g.fillStyle = "rgba(8,4,2,0.85)";
      g.fillRect(0, y0, S, 3);
      g.fillStyle = "rgba(160,110,70,0.12)";
      g.fillRect(0, y0 + 3, S, 1);
      // butt joints, staggered
      const jx = (p * 397 + 120) % S;
      g.fillStyle = "rgba(8,4,2,0.75)";
      g.fillRect(jx, y0, 3, ph);
    }
    paperFillOver(g, S);
  }

  /** A soft round light (the active baron's pool). */
  private poolTex() {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 128;
    const g = cv.getContext("2d")!;
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, "rgba(255,255,255,0.55)");
    gr.addColorStop(0.45, "rgba(255,255,255,0.22)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /** The side of a deck: the edges of stacked cards. */
  private cardEdges() {
    const cv = document.createElement("canvas");
    cv.width = 8;
    cv.height = 64;
    const g = cv.getContext("2d")!;
    for (let y = 0; y < 64; y += 7) {
      g.fillStyle = "#ece4d3";
      g.fillRect(0, y, 8, 5);
      g.fillStyle = "#b9ae99";
      g.fillRect(0, y + 5, 8, 2);
    }
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // ---- the board ---------------------------------------------------------------------------------

  private buildBoard() {
    const s = this.scene;
    // the board itself: thick card wrapped in void paper
    const side = new THREE.MeshStandardMaterial({ color: "#161413", roughness: 0.72 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(B, TH + 0.08, B), side);
    slab.position.y = (TH - 0.08) / 2;
    slab.receiveShadow = true;
    slab.castShadow = true;
    slab.raycast = () => {};
    s.add(slab);
    // a fine cream double rule printed round the track
    const rule = new THREE.MeshBasicMaterial({ color: "#d9cfbb", transparent: true, opacity: 0.55 });
    for (const [off, w] of [
      [HALF + 0.1, 0.022],
      [HALF + 0.16, 0.008],
    ])
      for (const [x, z, sx, sz] of [
        [0, off, 2 * off + w, w],
        [0, -off, 2 * off + w, w],
        [off, 0, w, 2 * off],
        [-off, 0, w, 2 * off],
      ]) {
        const m = new THREE.Mesh(GEO.plane, rule);
        m.rotation.x = -Math.PI / 2;
        m.scale.set(sx, sz, 1);
        m.position.set(x, TH + 0.002, z);
        m.raycast = () => {};
        s.add(m);
      }
    // the spaces: printed card, flush with the board
    for (let i = 0; i < N; i++) {
      const f = frameOf(i);
      const cv = document.createElement("canvas");
      this.tileCanvases.push(cv);
      const [en, sub] = this.o.names(i);
      paintSpace(cv, SPACES[i], en, sub);
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.62, metalness: 0, emissive: new THREE.Color(0x000000) });
      this.tileMats.push(mat);
      const m = new THREE.Mesh(GEO.plane, mat);
      m.rotation.set(-Math.PI / 2, f.rot, 0, "YXZ");
      m.scale.set(f.corner ? TC : TW, TC, 1);
      m.position.set(f.x, TH + 0.001, f.z);
      m.receiveShadow = true;
      m.userData.space = i;
      s.add(m);
      this.tiles.push(m);
      const bg = new THREE.Group();
      s.add(bg);
      this.builds.push(bg);
      this.levels.push(0);
      this.coins.push(null);
      this.coinOwner.push(-1);
      this.bars.push(null);
      this.pledged.push(null);
    }
    // the fold: a faint seam across the middle of the board, and its lit lip
    const seam = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.32, depthWrite: false }));
    seam.rotation.x = -Math.PI / 2;
    seam.scale.set(B, 0.016, 1);
    seam.position.set(0, TH + 0.004, 0);
    seam.renderOrder = 1;
    seam.raycast = () => {};
    s.add(seam);
    const lip = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ color: "#fff6e6", transparent: true, opacity: 0.07, depthWrite: false }));
    lip.rotation.x = -Math.PI / 2;
    lip.scale.set(B, 0.02, 1);
    lip.position.set(0, TH + 0.004, 0.02);
    lip.renderOrder = 1;
    lip.raycast = () => {};
    s.add(lip);
    // the Penitentiary's cell: bars on two edges of the printed cell
    const cell = 0.6 * TC;
    const iron: Part[] = [];
    for (let k = 0; k < 7; k++) {
      iron.push(["#3b3836", 0.035, 0.44, 0.035, -TC / 2 + cell, 0.22, -TC / 2 + (k + 0.5) * (cell / 7)]);
      iron.push(["#3b3836", 0.035, 0.44, 0.035, -TC / 2 + (k + 0.5) * (cell / 7), 0.22, -TC / 2 + cell]);
    }
    iron.push(["#3b3836", 0.05, 0.05, cell + 0.05, -TC / 2 + cell, 0.45, -TC / 2 + cell / 2]);
    iron.push(["#3b3836", cell + 0.05, 0.05, 0.05, -TC / 2 + cell / 2, 0.45, -TC / 2 + cell]);
    const bars = new THREE.Mesh(voxels(iron), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.6 }));
    bars.position.copy(local(JAIL, 0, 0, tmpV, TH));
    bars.rotation.y = frameOf(JAIL).rot;
    bars.castShadow = true;
    bars.raycast = () => {};
    s.add(bars);
    this.cornerProps();
  }

  private printSpaces() {
    for (let i = 0; i < N; i++) {
      const [en, sub] = this.o.names(i);
      paintSpace(this.tileCanvases[i], SPACES[i], en, sub);
      this.tileMats[i].map!.needsUpdate = true;
    }
  }

  private centreCv: HTMLCanvasElement | null = null;
  private centreTex: THREE.CanvasTexture | null = null;
  private printMiddle() {
    if (!this.centreCv || !this.centreTex) return;
    paintCentre(this.centreCv, INNER, DECK_X, this.o.deckNames, this.o.title, this.o.tagline, this.o.bank, this.lowEnd ? 1536 : 2048);
    this.centreTex.needsUpdate = true;
  }

  /** The middle: its print, the felt dice tray, the decks, the bank's chip rack. */
  private buildMiddle() {
    const s = this.scene;
    this.centreCv = document.createElement("canvas");
    this.centreTex = new THREE.CanvasTexture(this.centreCv);
    this.printMiddle();
    this.centreTex.colorSpace = THREE.SRGBColorSpace;
    this.centreTex.anisotropy = 8;
    const centre = new THREE.Mesh(GEO.plane, new THREE.MeshStandardMaterial({ map: this.centreTex, roughness: 0.7 }));
    centre.rotation.x = -Math.PI / 2;
    centre.scale.set(INNER, INNER, 1);
    centre.position.y = TH + 0.001;
    centre.receiveShadow = true;
    centre.raycast = () => {};
    s.add(centre);
    // the tray: a felt pad in a walnut frame
    const felt = document.createElement("canvas");
    felt.width = 512;
    felt.height = 384;
    const fg = felt.getContext("2d")!;
    paperFill(fg, 512, 384, "#221e27", 1.4);
    fg.strokeStyle = "rgba(196,177,252,0.07)";
    fg.lineWidth = 2;
    for (let k = -400; k < 900; k += 26) {
      fg.beginPath();
      fg.moveTo(k, 0);
      fg.lineTo(k + 200, 384);
      fg.stroke();
    }
    const vg = fg.createRadialGradient(256, 192, 40, 256, 192, 300);
    vg.addColorStop(0, "rgba(255,255,255,0.04)");
    vg.addColorStop(1, "rgba(0,0,0,0.35)");
    fg.fillStyle = vg;
    fg.fillRect(0, 0, 512, 384);
    const ft = new THREE.CanvasTexture(felt);
    ft.colorSpace = THREE.SRGBColorSpace;
    const pad = new THREE.Mesh(new THREE.BoxGeometry(TRAY_W, FELT - TH, TRAY_D), new THREE.MeshStandardMaterial({ map: ft, roughness: 1 }));
    pad.position.y = (FELT + TH) / 2;
    pad.receiveShadow = true;
    pad.raycast = () => {};
    s.add(pad);
    const walnut = new THREE.MeshStandardMaterial({ color: "#3a2416", roughness: 0.42, metalness: 0 });
    const lipM = new THREE.MeshStandardMaterial({ color: "#5a3a22", roughness: 0.35 });
    const t = 0.13;
    for (const [w, d, x, z] of [
      [TRAY_W + 2 * t, t, 0, TRAY_D / 2 + t / 2],
      [TRAY_W + 2 * t, t, 0, -TRAY_D / 2 - t / 2],
      [t, TRAY_D, TRAY_W / 2 + t / 2, 0],
      [t, TRAY_D, -TRAY_W / 2 - t / 2, 0],
    ]) {
      const m = block("#3a2416", w, WALL_H, d, x, TH + WALL_H / 2, z, s, walnut);
      m.castShadow = true;
      m.receiveShadow = true;
      m.raycast = () => {};
      const cap = block("#5a3a22", w + 0.012, 0.02, d + 0.012, x, TH + WALL_H + 0.01, z, s, lipM);
      cap.raycast = () => {};
    }
    // the decks
    for (const [deck, x] of [
      ["mempool", -DECK_X],
      ["qip", DECK_X],
    ] as const) {
      const cv = document.createElement("canvas");
      paintCardBack(cv, deck, deck === "mempool" ? this.o.deckNames[0] : this.o.deckNames[1]);
      const tx = new THREE.CanvasTexture(cv);
      tx.colorSpace = THREE.SRGBColorSpace;
      tx.anisotropy = 4;
      const g = new THREE.Group();
      const edge = new THREE.MeshStandardMaterial({ map: this.cardEdges(), roughness: 0.9 });
      const topM = new THREE.MeshStandardMaterial({ map: tx, roughness: 0.55 });
      const H = 9 * 0.027;
      const body = new THREE.Mesh(GEO.box, edge);
      body.scale.set(1.2, H, 1.68);
      body.position.y = H / 2;
      body.castShadow = body.receiveShadow = true;
      g.add(body);
      const face = new THREE.Mesh(GEO.plane, topM);
      face.rotation.x = -Math.PI / 2;
      face.scale.set(1.2, 1.68, 1);
      face.position.y = H + 0.001;
      g.add(face);
      // the top card, a little askew: it lifts and turns when drawn
      const top = new THREE.Group();
      const tb = new THREE.Mesh(GEO.box, edge);
      tb.scale.set(1.2, 0.026, 1.68);
      tb.castShadow = true;
      const tf = new THREE.Mesh(GEO.plane, topM);
      tf.rotation.x = -Math.PI / 2;
      tf.scale.set(1.2, 1.68, 1);
      tf.position.y = 0.0135;
      top.add(tb, tf);
      top.position.set(0.02, H + 0.013, -0.015);
      top.rotation.y = 0.03;
      g.add(top);
      g.position.set(x, TH, 0);
      s.add(g);
      this.deckMeshes.push(g);
    }
    // the bank: a walnut rack of credit chips, four stacks
    const rack = block("#3a2416", 2.3, 0.07, 0.6, 0, TH + 0.035, RACK_Z, s, walnut);
    rack.castShadow = rack.receiveShadow = true;
    const heights = [16, 12, 9, 14];
    CHIP_COLORS.forEach((c, k) => {
      for (const dz of [-0.13, 0.13]) {
        const n = heights[k] - (dz > 0 ? 3 : 0);
        const st = this.chipStack(c, n);
        st.position.set(-0.84 + k * 0.56, TH + 0.07, RACK_Z + dz);
        s.add(st);
      }
    });
  }

  /** A stack of n credit chips: one cylinder, its side printed with the chips' edges. */
  private chipStack(color: string, n: number, edgeTex?: THREE.Texture) {
    const ch = 0.034;
    let et = edgeTex;
    if (!et) {
      const cv = document.createElement("canvas");
      paintChipEdge(cv, color);
      et = new THREE.CanvasTexture(cv);
      et.colorSpace = THREE.SRGBColorSpace;
      et.wrapS = et.wrapT = THREE.RepeatWrapping;
      et.repeat.set(3, n);
    }
    const fc = document.createElement("canvas");
    paintChipFace(fc, color);
    const ftx = new THREE.CanvasTexture(fc);
    ftx.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.CylinderGeometry(0.17, 0.17, 1, 28, 1);
    geo.translate(0, 0.5, 0);
    geo.groups.pop();
    const m = new THREE.Mesh(geo, [new THREE.MeshStandardMaterial({ map: et, roughness: 0.5 }), new THREE.MeshStandardMaterial({ map: ftx, roughness: 0.45 }), new THREE.MeshStandardMaterial({ color })]);
    m.scale.set(1, ch * n, 1);
    m.castShadow = true;
    m.receiveShadow = true;
    m.raycast = () => {};
    return m;
  }

  /** Toy details on the corners: the genesis block, the park's trees, the Tracker's machine. */
  private cornerProps() {
    const s = this.scene;
    const put = (o: THREE.Object3D, i: number, lx: number, lz: number, y = TH) => {
      o.position.copy(local(i, lx, lz, tmpV, y));
      o.rotation.y = frameOf(i).rot;
      o.traverse((c) => {
        c.raycast = () => {};
        if ((c as THREE.Mesh).isMesh) c.castShadow = true;
      });
      s.add(o);
      return o;
    };
    // GENESIS: a flare block, capped
    const gen = new THREE.Group();
    const cube = block(FLARE, 0.34, 0.34, 0.34, 0, 0.17, 0, gen, new THREE.MeshStandardMaterial({ color: FLARE, roughness: 0.4 }));
    outline(cube, 0.012);
    block("#ece4d3", 0.36, 0.05, 0.36, 0, 0.365, 0, gen, new THREE.MeshStandardMaterial({ color: "#ece4d3", roughness: 0.6 }));
    put(gen, 0, 0.5, 0.52);
    // CENTRAL PARK: two voxel trees and a bench, one painted-wood piece
    const tree = (h: number, x: number, z: number): Part[] => [
      ["#5a3c26", 0.07, h, 0.07, x, h / 2, z],
      ["#5fae7a", 0.3, 0.26, 0.3, x, h + 0.1, z],
      ["#7fca95", 0.2, 0.16, 0.2, x, h + 0.28, z],
    ];
    const park = new THREE.Mesh(
      voxels([
        ...tree(0.22, -0.55, 0.55),
        ...tree(0.32, -0.2, 0.66),
        ["#e8e2d4", 0.34, 0.04, 0.12, 0.6, 0.1, 0.62],
        ["#e8e2d4", 0.34, 0.1, 0.03, 0.6, 0.17, 0.57],
        ["#2e2b29", 0.03, 0.1, 0.1, 0.46, 0.05, 0.62],
        ["#2e2b29", 0.03, 0.1, 0.1, 0.74, 0.05, 0.62],
      ]),
      this.voxMat,
    );
    put(park, PARK, 0, 0);
    const iron = new THREE.MeshStandardMaterial({ color: "#2e2b29", roughness: 0.4, metalness: 0.5 });
    // TRACKER'S RAID: the chain-analysis machine that links transparent coins (a chandelier of cold plates, a red eye)
    const shor = new THREE.Group();
    const silver = new THREE.MeshStandardMaterial({ color: "#b9c9cf", roughness: 0.25, metalness: 0.75 });
    for (let k = 0; k < 4; k++) {
      const d = new THREE.Mesh(GEO.cyl, silver);
      d.scale.set(0.42 - k * 0.08, 0.035, 0.42 - k * 0.08);
      d.position.y = 0.72 - k * 0.15;
      shor.add(d);
    }
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      block("#c4d6dd", 0.02, 0.45, 0.02, Math.cos(a) * 0.12, 0.5, Math.sin(a) * 0.12, shor, silver);
    }
    const qb = new THREE.Mesh(GEO.ball, glow("#ff5c8a"));
    qb.scale.setScalar(0.12);
    qb.position.y = 0.2;
    shor.add(qb);
    block("#3a3442", 0.05, 0.8, 0.05, 0.3, 0.4, 0, shor, iron);
    block("#3a3442", 0.32, 0.05, 0.05, 0.15, 0.8, 0, shor, iron);
    put(shor, 30, 0.42, -0.42);
  }

  // ---- the pot, the coins, the dice, the chips ---------------------------------------------------

  /** CENTRAL PARK's pot: a stack of chips and its paper tag. */
  setPot(v: number) {
    const n = Math.min(24, Math.ceil(v / 20));
    this.potStack.visible = n > 0;
    if (n > 0) {
      this.potStack.scale.y = 0.034 * n;
      this.potEdge.repeat.set(3, n);
    }
    const x = this.potCv.getContext("2d")!;
    x.clearRect(0, 0, 256, 112);
    this.potLabel.visible = v > 0;
    if (v > 0) {
      x.save();
      x.translate(128, 56);
      x.rotate(-0.04);
      paperTag(x, `POT ${v} cr`);
      x.restore();
    }
    this.potTex.needsUpdate = true;
    this.shadowsDirty = true;
  }

  private makeCoinTextures() {
    for (const s of this.o.seats) {
      const cv = document.createElement("canvas");
      paintCoin(cv, s.color, null);
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      this.coinTex.push(t);
      const img = new Image();
      // (ZScan's NFT art is cross-origin: CORS-open, so the coin's canvas stays clean for WebGL)
      img.crossOrigin = "anonymous";
      img.onload = () => {
        paintCoin(cv, s.color, img);
        t.needsUpdate = true;
      };
      const src = personImage(s.id);
      if (src) img.src = src;
    }
  }

  private makeDice() {
    const geo = new RoundedBoxGeometry(1, 1, 1, 3, 0.14);
    // +x 3, −x 4, +y 1, −y 6, +z 2, −z 5
    for (const n of [3, 4, 1, 6, 2, 5]) {
      const cv = document.createElement("canvas");
      paintDie(cv, n);
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      this.dieMats.push(new THREE.MeshStandardMaterial({ map: t, roughness: 0.3, metalness: 0 }));
    }
    for (let k = 0; k < 2; k++) {
      const d = new THREE.Mesh(geo, this.dieMats);
      d.scale.setScalar(DIE);
      d.castShadow = true;
      d.position.set(k ? 0.45 : -0.45, FELT + DIE / 2, 0.2);
      d.quaternion.copy(faceUp(k ? 5 : 2, k * 0.6));
      d.raycast = () => {};
      this.scene.add(d);
      this.dice.push(d);
    }
  }

  private makeChips() {
    const faces = CHIP_COLORS.map((c) => {
      const cv = document.createElement("canvas");
      paintChipFace(cv, c);
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.45 });
    });
    const sides = CHIP_COLORS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }));
    const geo = new THREE.CylinderGeometry(0.11, 0.11, 0.034, 22);
    for (let k = 0; k < 36; k++) {
      const ci = k % 7 === 0 ? 2 : k % 3 === 0 ? 1 : 3;
      const m = new THREE.Mesh(geo, [sides[ci], faces[ci], faces[ci]]);
      m.visible = false;
      m.castShadow = true;
      m.raycast = () => {};
      this.scene.add(m);
      this.chips.push({ m, a: new THREE.Vector3(), b: new THREE.Vector3(), t: 0, d: 1, live: false, spin: 1 });
    }
  }

  private addPawn(s: TableSeat) {
    const player: Player = { seat: s.seat, id: s.id, name: s.name, color: s.color, dark: s.color, human: s.human, skill: s.skill, img: new Image() };
    const av = new Avatar(this.scene, player, { scale: 0.33, marker: false, ring: false });
    av.body.root.position.y = 0.06;
    // the enamel base: a weighted disc in the seat's colour with a cream bead round its top
    const base = new THREE.Group();
    const enamel = new THREE.MeshStandardMaterial({ color: s.color, roughness: 0.28, metalness: 0.05 });
    const disc = new THREE.Mesh(GEO.cyl, enamel);
    disc.scale.set(0.3, 0.05, 0.3);
    disc.position.y = 0.025;
    disc.castShadow = true;
    base.add(disc);
    const bead = new THREE.Mesh(GEO.cyl, new THREE.MeshStandardMaterial({ color: "#efe8d8", roughness: 0.4 }));
    bead.scale.set(0.24, 0.016, 0.24);
    bead.position.y = 0.057;
    base.add(bead);
    av.root.add(base);
    av.floor = TH;
    this.pawns.push({ seat: s.seat, av, space: 0, jailed: false, out: false, home: new THREE.Vector3(), hopping: false, base });
  }

  // ---- layout and state --------------------------------------------------------------------------

  /** Everyone's spot on their space (smoothly, unless `snap`). */
  private layout(snapSpace = -1) {
    const by = new Map<string, Pawn[]>();
    for (const p of this.pawns) {
      if (p.out) continue;
      const k = `${p.space}:${p.jailed ? 1 : 0}`;
      const a = by.get(k) ?? [];
      a.push(p);
      by.set(k, a);
    }
    for (const [, list] of by)
      list.forEach((p, k) => {
        slotOf(p.space, k, list.length, p.jailed, p.home);
        if (snapSpace === p.space || snapSpace === 0) p.av.pos.copy(p.home);
      });
  }
  setPawn(seat: number, space: number, jailed: boolean) {
    const p = this.pawns[seat];
    p.space = space;
    p.jailed = jailed;
    this.layout();
  }
  setOut(seat: number) {
    const p = this.pawns[seat];
    p.out = true;
    if (this.active === seat) this.setActive(-1);
    // the token tips over and sinks off the board
    const r = p.av.root;
    const z0 = r.rotation.z;
    void this.tween(0.9, (k) => {
      r.rotation.z = z0 + easeOut(k) * 1.45;
      p.av.pos.y = TH - k * k * 0.4;
    }).then(() => (r.visible = false));
    this.layout();
  }
  setActive(seat: number) {
    this.active = seat;
    const on = seat >= 0 && !this.pawns[seat]?.out;
    this.activeRing.visible = this.activePool.visible = on;
    if (on) {
      (this.activeRing.material as THREE.MeshBasicMaterial).color.set(this.colors[seat]);
      (this.activePool.material as THREE.MeshBasicMaterial).color.set(this.colors[seat]);
    }
  }

  /** A deed's owner (−1: the bank) and its collateral: the owner's coin on it, an edge bar. */
  setOwner(i: number, seat: number, mortgaged: boolean) {
    const f = frameOf(i);
    let coin = this.coins[i];
    let bar = this.bars[i];
    const was = this.coinOwner[i];
    this.coinOwner[i] = seat;
    this.shadowsDirty = true;
    if (seat < 0) {
      if (coin) {
        const c = coin;
        this.coins[i] = null;
        void this.tween(0.3, (k) => c.scale.setScalar(Math.max(0.001, 1 - k))).then(() => this.scene.remove(c));
      }
      if (bar) (this.scene.remove(bar), (this.bars[i] = null));
      this.setPledged(i, false);
      return;
    }
    const c = this.colors[seat];
    if (!bar) {
      bar = new THREE.Mesh(GEO.box, new THREE.MeshStandardMaterial({ color: c, roughness: 0.35 }));
      bar.scale.set((f.corner ? TC : TW) - 0.1, 0.014, 0.05);
      bar.position.copy(local(i, 0, TC / 2 - 0.05, tmpV, TH + 0.007));
      bar.rotation.y = f.rot;
      bar.raycast = () => {};
      this.scene.add(bar);
      this.bars[i] = bar;
    }
    (bar.material as THREE.MeshStandardMaterial).color.set(mortgaged ? "#5b5650" : c);
    const at = local(i, 0, TC / 2 - 0.24, new THREE.Vector3(), TH + 0.017);
    // the coin's face turns down when the deed is pledged
    const flip = mortgaged ? Math.PI : 0;
    if (!coin) {
      coin = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.03, 32), [new THREE.MeshStandardMaterial({ color: c, roughness: 0.35 }), new THREE.MeshStandardMaterial({ map: this.coinTex[seat], roughness: 0.4 }), this.coinBack]);
      coin.raycast = () => {};
      coin.rotation.set(flip, f.rot + Math.PI, 0);
      coin.position.copy(at);
      this.scene.add(coin);
      this.coins[i] = coin;
      // dropped onto the space with a spin
      const cn = coin;
      cn.position.y = at.y + 0.9;
      void this.tween(0.42, (k) => {
        cn.position.y = at.y + 0.9 * (1 - k) * (1 - k);
        cn.rotation.x = flip + (1 - k) * Math.PI * 2;
      });
    } else {
      const cn = coin;
      const mats = cn.material as THREE.Material[];
      const swap = was !== seat;
      const x0 = cn.rotation.x;
      void this.tween(0.36, (k) => {
        cn.position.y = at.y + Math.sin(k * Math.PI) * 0.35;
        cn.rotation.x = x0 + (flip + (swap ? Math.PI * 2 : 0) - x0) * k;
        if (swap && k > 0.5 && (mats[1] as THREE.MeshStandardMaterial).map !== this.coinTex[seat]) {
          (mats[1] as THREE.MeshStandardMaterial).map = this.coinTex[seat];
          (mats[0] as THREE.MeshStandardMaterial).color.set(c);
          mats[1].needsUpdate = true;
        }
      }).then(() => {
        cn.rotation.x = flip;
        cn.position.y = at.y;
      });
    }
    this.setPledged(i, mortgaged);
  }
  private pledgedTex: THREE.CanvasTexture | null = null;
  private setPledged(i: number, on: boolean) {
    let m = this.pledged[i];
    if (!on) {
      if (m) m.visible = false;
      return;
    }
    if (!this.pledgedTex) {
      const cv = document.createElement("canvas");
      paintPledged(cv, "COLLATERAL");
      this.pledgedTex = new THREE.CanvasTexture(cv);
      this.pledgedTex.colorSpace = THREE.SRGBColorSpace;
    }
    if (!m) {
      const f = frameOf(i);
      m = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: this.pledgedTex, transparent: true, depthWrite: false }));
      m.rotation.set(-Math.PI / 2, f.rot, 0, "YXZ");
      m.scale.set((f.corner ? TC : TW) - 0.04, TC - 0.04, 1);
      m.position.set(f.x, TH + 0.005, f.z);
      m.renderOrder = 1;
      m.raycast = () => {};
      this.scene.add(m);
      this.pledged[i] = m;
    }
    m.visible = true;
  }

  /** Houses (1…4) or the Foundry (5) on a deed's district band; `anim`: they rise. */
  setLevel(i: number, level: number, anim = true) {
    const was = this.levels[i];
    if (was === level) return;
    this.levels[i] = level;
    this.shadowsDirty = true;
    const g = this.builds[i];
    const f = frameOf(i);
    const grp = GROUPS[SPACES[i].group!];
    const clear = () => {
      while (g.children.length) g.remove(g.children[0]);
    };
    this.smoke = this.smoke.filter((s) => !s.at.equals(local(i, 0.18, -TC / 2 + 0.17, tmpV, TH + 0.86)));
    if (level === 5) {
      const fd = this.makeFoundry(grp.color);
      fd.position.copy(local(i, 0, -TC / 2 + 0.17, tmpV, TH));
      fd.rotation.y = f.rot;
      const rise = () => {
        clear();
        g.add(fd);
        this.smoke.push({ at: local(i, 0.18, -TC / 2 + 0.17, new THREE.Vector3(), TH + 0.86), t: Math.random() });
      };
      if (anim && level > was && this.speed < 50) {
        // the four houses sink into the board, the Foundry rises in their place
        const old = g.children.slice();
        void this.tween(0.3, (k) => old.forEach((o) => o.scale.set(1, Math.max(0.01, 1 - k), 1))).then(() => {
          rise();
          fd.scale.set(1, 0.01, 1);
          void this.tween(0.65, (k) => fd.scale.set(1 + (1 - k) * 0.15 * Math.sin(k * 9), Math.max(0.01, backOut(k)), 1));
          this.fx.burst(fd.position.clone().setY(TH + 0.4), 30, [FLARE, grp.color, "#ece4d3"], { speed: 2.6, up: 3.5, size: 0.06, gravity: 12 });
        });
      } else rise();
      return;
    }
    clear();
    for (let k = 0; k < level; k++) {
      const h = this.makeHouse(grp.color, k);
      h.position.copy(local(i, (k - 1.5) * 0.225, -TC / 2 + 0.17, tmpV, TH));
      h.rotation.y = f.rot;
      g.add(h);
      if (anim && k >= was && level > was && this.speed < 50) {
        h.scale.set(1, 0.01, 1);
        const d = 0.1 * (k - was);
        void this.wait(d).then(() =>
          this.tween(0.45, (q) => {
            const s = backOut(q);
            h.scale.set(1 + (1 - q) * 0.25, Math.max(0.01, s), 1 + (1 - q) * 0.25);
          }),
        );
        this.fx.burst(h.position.clone().setY(TH + 0.05), 10, ["#ece4d3", "#cfc5b1", grp.color], { speed: 1.6, up: 1.4, size: 0.04, gravity: 8 });
      }
    }
  }
  /** Painted wood, coloured per vertex: every building and prop that is made of blocks. */
  private voxMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72 });
  /** The lit windows of every building. */
  private litMat = new THREE.MeshStandardMaterial({ color: "#ffc7a0", emissive: "#ff6b35", emissiveIntensity: 0.9, roughness: 0.6 });
  private shapes = new Map<string, [THREE.BufferGeometry, THREE.BufferGeometry]>();
  private building(key: string, body: Part[], lit: Part[]) {
    let sh = this.shapes.get(key);
    if (!sh) {
      sh = [voxels(body), voxels(lit)];
      this.shapes.set(key, sh);
    }
    const g = new THREE.Group();
    const m = new THREE.Mesh(sh[0], this.voxMat);
    m.castShadow = m.receiveShadow = true;
    const w = new THREE.Mesh(sh[1], this.litMat);
    g.add(m, w);
    g.traverse((o) => (o.raycast = () => {}));
    return g;
  }
  /** A miner: a little painted-wood shed, cream walls, a roof in the district's colour, a fan box, a lit window. */
  private makeHouse(color: string, k: number) {
    const h = [0.17, 0.21, 0.19, 0.23][k % 4];
    return this.building(
      `m${color}${k % 4}`,
      [
        ["#ebe3d2", 0.16, h, 0.15, 0, h / 2, 0],
        [color, 0.19, 0.045, 0.18, 0, h + 0.022, 0],
        [color, 0.11, 0.04, 0.18, 0, h + 0.064, 0],
        ["#2b2622", 0.065, 0.03, 0.065, 0.045, h + 0.098, -0.035],
        ["#2b2622", 0.04, 0.07, 0.01, 0.04, 0.035, 0.076],
      ],
      [[FLARE, 0.05, 0.045, 0.01, -0.035, h * 0.62, 0.076]],
    );
  }
  /** The Foundry: a dark hall with lit windows, a band of the district's colour, a chimney. */
  private makeFoundry(color: string) {
    const lit: Part[] = [];
    for (let k = 0; k < 5; k++) lit.push([FLARE, 0.09, 0.08, 0.012, -0.32 + k * 0.16, 0.16, 0.152]);
    for (let k = 0; k < 3; k++) lit.push([FLARE, 0.07, 0.06, 0.012, -0.26 + k * 0.12, 0.47, 0.102]);
    lit.push([FLARE, 0.11, 0.03, 0.11, 0.18, 0.8, -0.02]);
    return this.building(
      `f${color}`,
      [
        ["#2b2622", 0.84, 0.3, 0.3, 0, 0.15, 0],
        [color, 0.88, 0.06, 0.34, 0, 0.33, 0],
        ["#3a3430", 0.4, 0.22, 0.24, -0.14, 0.47, -0.02],
        [color, 0.44, 0.04, 0.28, -0.14, 0.6, -0.02],
        ["#3a3430", 0.09, 0.44, 0.09, 0.18, 0.57, -0.02],
      ],
      lit,
    );
  }

  // ---- animations --------------------------------------------------------------------------------

  tween(d: number, f: (k: number) => void, still = false): Promise<void> {
    return new Promise((done) => {
      if (this.speed > 50) {
        f(1);
        done();
        return;
      }
      this.tweens.push({ t: 0, d: Math.max(0.001, d), f, done, still });
    });
  }
  /** A pause (nothing moves: the shadows need not be redrawn). */
  wait(s: number) {
    return this.tween(s, noop, true);
  }

  /** Hop the token space by space (`steps` < 0: backwards). onStep: each landing (`last`: the final one). */
  async hop(seat: number, from: number, steps: number, onStep?: (i: number, k: number, last: boolean) => void) {
    const p = this.pawns[seat];
    const dir = steps < 0 ? -1 : 1;
    const n = Math.abs(steps);
    p.hopping = true;
    p.jailed = false;
    let at = from;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const dur = n > 8 ? 0.15 : 0.19;
    const body = p.av.body.root;
    const s0 = p.av.scale;
    for (let k = 0; k < n; k++) {
      const next = (at + dir + N) % N;
      a.copy(p.av.pos);
      const last = k === n - 1;
      if (last) {
        p.space = next;
        this.layout();
        b.copy(p.home);
      } else slotOf(next, 0, 1, false, b);
      p.av.yaw = Math.atan2(b.x - a.x, b.z - a.z);
      p.av.grounded = false;
      const hgt = last ? 0.42 : 0.3;
      await this.tween(dur * (last ? 1.25 : 1), (q) => {
        p.av.pos.lerpVectors(a, b, q);
        p.av.pos.y = TH + Math.sin(q * Math.PI) * hgt;
        p.av.vy = Math.cos(q * Math.PI) * 4;
        // stretch in the air, squash on the ground
        const st = q < 0.12 ? 1 - (q / 0.12) * 0.18 : q > 0.88 ? 0.82 + ((1 - q) / 0.12) * 0.18 : 1 + Math.sin(((q - 0.12) / 0.76) * Math.PI) * 0.1;
        body.scale.set(s0 / Math.sqrt(st), s0 * st, s0 / Math.sqrt(st));
      });
      p.av.grounded = true;
      p.av.vy = 0;
      at = next;
      onStep?.(next, k, last);
    }
    // the landing settles
    void this.tween(0.18, (q) => {
      const st = 0.86 + 0.14 * easeOut(q);
      body.scale.set(s0 / Math.sqrt(st), s0 * st, s0 / Math.sqrt(st));
    });
    p.hopping = false;
    p.space = at;
    this.layout();
  }

  /** A long jump (to the Penitentiary). */
  async leap(seat: number, to: number, jailed: boolean) {
    const p = this.pawns[seat];
    p.hopping = true;
    p.space = to;
    p.jailed = jailed;
    this.layout();
    const a = p.av.pos.clone();
    const b = p.home.clone();
    p.av.yaw = Math.atan2(b.x - a.x, b.z - a.z);
    p.av.grounded = false;
    await this.tween(0.85, (q) => {
      p.av.pos.lerpVectors(a, b, easeOut(q));
      p.av.pos.y = TH + Math.sin(q * Math.PI) * 3.2;
      p.av.vy = Math.cos(q * Math.PI) * 6;
    });
    p.av.grounded = true;
    p.hopping = false;
    this.fx.burst(b.clone().setY(TH + 0.1), 14, ["#8a8784", "#e8e6e0"], { speed: 2.5, up: 2, size: 0.05 });
  }

  /**
   * The roll: the dice rattle over the roller's token, are thrown into the tray, bounce off its
   * felt and walls and come to rest showing a and b. onHit: each knock, for the sound.
   */
  async rollDice(seat: number, a: number, b: number, onHit?: (kind: "floor" | "wall" | "dice", s: number, first: boolean) => void): Promise<void> {
    const p = this.pawns[seat];
    const th = simulate(p.av.pos, [a, b]);
    if (this.speed > 50) {
      this.poseDice(th, th.n - 1);
      return;
    }
    // in the fist: the dice jiggle over the token
    const hand = p.av.pos.clone().setY(TH + 1.05);
    const d0 = this.dice[0],
      d1 = this.dice[1];
    this.shadowsDirty = true;
    await this.tween(0.32, (q) => {
      for (let k = 0; k < 2; k++) {
        const d = k ? d1 : d0;
        d.position.set(hand.x + (k - 0.5) * 0.24 + Math.sin(q * 40 + k) * 0.05, hand.y + Math.abs(Math.sin(q * 30 + k * 2)) * 0.1, hand.z + Math.cos(q * 34 + k) * 0.05);
        d.rotation.set(q * 18 + k, q * 11, q * 14 + k * 2);
      }
    });
    return new Promise((r) => {
      this.roll = { th, t: 0, f: 0, hit: 0, resolve: r, onHit: onHit ?? null, first: true };
    });
  }
  private poseDice(th: Throw, f: number) {
    for (let k = 0; k < 2; k++) {
      const d = this.dice[k];
      const P = th.pos[k],
        R = th.rot[k];
      d.position.set(P[f * 3], P[f * 3 + 1], P[f * 3 + 2]);
      d.quaternion.set(R[f * 4], R[f * 4 + 1], R[f * 4 + 2], R[f * 4 + 3]).multiply(th.fix[k]);
    }
  }
  private stepDice(dt: number) {
    const r = this.roll;
    if (!r) return;
    r.t += dt * this.speed;
    const f = Math.min(r.th.n - 1, Math.floor(r.t * 120));
    this.poseDice(r.th, f);
    while (r.hit < r.th.hits.length && r.th.hits[r.hit].f <= f) {
      const h = r.th.hits[r.hit++];
      r.onHit?.(h.kind, h.s, r.first && h.kind === "floor");
      if (h.kind === "floor") r.first = false;
    }
    if (f >= r.th.n - 1) {
      this.roll = null;
      r.resolve?.();
    }
  }
  /** Where the dice are (for the camera). */
  diceAt(v = new THREE.Vector3()) {
    return v.copy(this.dice[0].position).add(this.dice[1].position).multiplyScalar(0.5);
  }

  /** Credit chips flying from → to (seats, or "bank", or "park"); n chips. */
  async payChips(from: number | "bank" | "park", to: number | "bank" | "park", n: number, onEach?: () => void) {
    const a = this.pointOf(from, new THREE.Vector3());
    const b = this.pointOf(to, new THREE.Vector3());
    const d = 0.55;
    const gap = 0.055;
    let free = this.chips.filter((c) => !c.live).slice(0, Math.max(1, Math.min(14, n)));
    if (this.speed > 50) free = [];
    free.forEach((c, k) => {
      c.live = true;
      c.a.copy(a).add(tmpV.set((Math.random() - 0.5) * 0.2, 0, (Math.random() - 0.5) * 0.2));
      c.b.copy(b).add(tmpV.set((Math.random() - 0.5) * 0.25, 0, (Math.random() - 0.5) * 0.25));
      c.t = -k * gap;
      c.d = d;
      c.spin = rnd(6, 12);
      c.m.visible = false;
    });
    const total = d + gap * free.length;
    let fired = 0;
    await this.tween(total, (q) => {
      const t = q * total - d * 0.85;
      const due = Math.floor(t / gap) + 1;
      while (fired < Math.min(free.length, due) && onEach) (onEach(), fired++);
    });
  }
  private pointOf(w: number | "bank" | "park", v: THREE.Vector3) {
    if (w === "bank") return v.set(0, TH + 0.6, RACK_Z);
    if (w === "park") return local(PARK, 0.42, -0.42, v, TH + 0.4);
    const p = this.pawns[w];
    return v.copy(p.av.pos).setY(p.av.pos.y + 0.45);
  }

  /** A puff of confetti on a space (bought, won). */
  burstAt(i: number, colors: string[], n = 24) {
    this.fx.burst(local(i, 0, 0, tmpV, TH + 0.3).clone(), n, colors, { speed: 3, up: 4.2, size: 0.06 });
  }
  cheer(seat: number) {
    this.pawns[seat].av.cheer(1.6);
  }
  ouch(seat: number) {
    this.pawns[seat].av.hit();
  }
  /** Flash a space (landed, picked). */
  pulse(i: number, color = "#ff6b35") {
    const m = this.tileMats[i];
    const c = new THREE.Color(color);
    void this.tween(0.8, (k) => m.emissive.copy(c).multiplyScalar(0.38 * (1 - k)));
  }
  /** A deck's top card lifts and turns over (the card itself is then the DOM's). */
  async liftCard(deck: "mempool" | "qip") {
    const g = this.deckMeshes[deck === "mempool" ? 0 : 1];
    const top = g.children[g.children.length - 1];
    const y0 = top.position.y;
    this.shadowsDirty = true;
    await this.tween(0.38, (k) => {
      top.position.y = y0 + Math.sin(k * Math.PI) * 0.7;
      top.rotation.z = easeOut(k) * Math.PI;
    });
    top.rotation.z = 0;
    top.position.y = y0;
  }

  // ---- the camera --------------------------------------------------------------------------------

  /** "over": the whole board from the player's side; a token; a space; a roll (token and tray). */
  focus(f: Focus) {
    this.focusMode = f;
  }
  setInsets(i: { left: number; right: number; top: number; bottom: number }) {
    const o = this.insets;
    if (o.left === i.left && o.right === i.right && o.top === i.top && o.bottom === i.bottom) return;
    this.insets = i;
    this.applyOffset();
  }
  private overDist() {
    const w = this.canvas.clientWidth || 1,
      h = this.canvas.clientHeight || 1;
    const fw = Math.max(80, w - this.insets.left - this.insets.right);
    const fh = Math.max(80, h - this.insets.top - this.insets.bottom);
    const t = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const tv = (t * fh) / h,
      th = (t * fw) / h;
    return Math.max(7.3 / tv, 9.6 / th) * 0.86;
  }
  private target(eye: THREE.Vector3, at: THREE.Vector3) {
    const f = this.focusMode;
    const z = this.zoom;
    if (f.k === "over") {
      const a = this.overYaw + this.orbit;
      if (this.upright()) return this.overUpright(a, eye, at);
      const d = this.overDist() * z;
      at.set(0, 0, 0.4);
      eye.set(Math.sin(a) * d * 0.6, d * 0.82, Math.cos(a) * d * 0.6);
      return;
    }
    let p: THREE.Vector3;
    let near = 0.5;
    if (f.k === "pawn") p = this.pawns[f.seat].av.pos;
    else if (f.k === "space") p = local(f.i, 0, 0, tmpV2, TH);
    else {
      // between the roller and the tray
      p = tmpV2.copy(this.pawns[f.seat].av.pos).multiplyScalar(0.45);
      near = 0.56;
    }
    const w = this.canvas.clientWidth || 1,
      h = this.canvas.clientHeight || 1;
    const aspect = Math.max(80, w - this.insets.left - this.insets.right) / Math.max(80, h - this.insets.top - this.insets.bottom);
    const d = THREE.MathUtils.clamp(this.overDist() * near, 10.5, 14 * Math.max(1, 1.15 / aspect)) * z;
    // seen from the player's side of the board, turned a little toward the subject
    const out = Math.atan2(p.x, p.z + 7) * 0.7 + this.orbit * 0.5 + this.overYaw;
    // (a narrow screen keeps the subject in the middle; a wide one leans toward the board's centre)
    const pull = aspect < 1 ? 0.95 : 0.78;
    at.set(p.x * pull, 0.15, p.z * pull);
    eye.set(at.x + Math.sin(out) * d * 0.52, d * 0.84, at.z + Math.cos(out) * d * 0.52);
  }
  /** A touch screen whose room for the board is about square or taller (a phone or a tablet held upright). */
  private upright() {
    if (!this.coarse) return false;
    const w = this.canvas.clientWidth || 1,
      h = this.canvas.clientHeight || 1;
    return w - this.insets.left - this.insets.right < (h - this.insets.top - this.insets.bottom) * 1.1;
  }
  /**
   * The whole board on an upright touch screen. The usual view is fitted for a wide screen, so upright
   * it left big empty bands above and below the board. Here the camera looks down more steeply (the
   * board's square stands taller on the screen) and comes as close as the room allows, measured on the
   * board's corners as they project, then aims so the board sits in the middle of that room.
   */
  private overUpright(a: number, eye: THREE.Vector3, at: THREE.Vector3) {
    const w = this.canvas.clientWidth || 1,
      h = this.canvas.clientHeight || 1;
    const hw = Math.max(40, (w - this.insets.left - this.insets.right) / 2 - 8);
    const hh = Math.max(40, (h - this.insets.top - this.insets.bottom) / 2 - 8);
    const k = h / 2 / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    fitDir.set(Math.sin(a) * 0.4, 0.92, Math.cos(a) * 0.4).normalize();
    fitFwd.copy(fitDir).negate();
    fitRight.crossVectors(fitFwd, UP).normalize();
    fitUp.crossVectors(fitRight, fitFwd);
    // the corners' box on the screen (px from its centre) for the camera at distance d from `aim`
    const box = (aim: THREE.Vector3, d: number) => {
      fitEye.copy(aim).addScaledVector(fitDir, d);
      let x0 = Infinity,
        x1 = -Infinity,
        y0 = Infinity,
        y1 = -Infinity;
      for (const c of CORNERS) {
        tmpV.subVectors(c, fitEye);
        const zc = Math.max(0.1, tmpV.dot(fitFwd));
        const x = (k * tmpV.dot(fitRight)) / zc,
          y = (k * tmpV.dot(fitUp)) / zc;
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
      return { x0, x1, y0, y1 };
    };
    fitAt.set(0, 0, 0);
    let d = 30;
    for (let pass = 0; pass < 3; pass++) {
      // the nearest the camera can be with the whole board inside the room
      let lo = 6,
        hi = 160;
      for (let i = 0; i < 24; i++) {
        const m = (lo + hi) / 2;
        const b = box(fitAt, m);
        if (b.x1 - b.x0 <= 2 * hw && b.y1 - b.y0 <= 2 * hh) hi = m;
        else lo = m;
      }
      d = hi;
      // then slide the aim so the board's box is centred (the near edge looks bigger than the far one)
      const b = box(fitAt, d);
      const cx = (b.x0 + b.x1) / 2,
        cy = (b.y0 + b.y1) / 2;
      fitAt.addScaledVector(fitRight, (cx * d) / k);
      tmpV2.set(fitUp.x, 0, fitUp.z).normalize();
      fitAt.addScaledVector(tmpV2, (cy * d) / (k * Math.max(0.2, Math.hypot(fitUp.x, fitUp.z))));
    }
    // (the player's own zoom still works, about the same aim)
    at.copy(fitAt);
    eye.copy(fitAt).addScaledVector(fitDir, d * this.zoom);
  }
  snapCamera() {
    this.target(this.eye, this.at);
    this.cam.set(this.eye, this.at);
    this.cam.apply(0);
  }
  setOverYaw(a: number) {
    this.overYaw = a;
  }
  shake(a = 0.08) {
    this.cam.shake(a);
  }

  // ---- input -------------------------------------------------------------------------------------

  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private offs: (() => void)[] = [];
  private pickAt(x: number, y: number) {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const hit = this.ray.intersectObjects(this.tiles, false)[0];
    return hit ? (hit.object.userData.space as number) : -1;
  }
  private bindInput() {
    const c = this.canvas;
    let down: { x: number; y: number; o: number; moved: boolean } | null = null;
    const pts = new Map<number, { x: number; y: number }>();
    let pinch0 = 0,
      zoom0 = 1;
    const pd = (e: PointerEvent) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
        zoom0 = this.zoom;
      }
      down = { x: e.clientX, y: e.clientY, o: this.orbit, moved: false };
      c.setPointerCapture?.(e.pointerId);
    };
    const pm = (e: PointerEvent) => {
      if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && pinch0) {
        const [a, b] = [...pts.values()];
        this.zoom = THREE.MathUtils.clamp((zoom0 * pinch0) / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)), 0.55, 1.35);
        if (down) down.moved = true;
        return;
      }
      if (down) {
        const dx = e.clientX - down.x;
        if (Math.abs(dx) > 6 || Math.abs(e.clientY - down.y) > 6) down.moved = true;
        if (down.moved) this.orbit = down.o - dx * 0.006;
        return;
      }
      if (e.pointerType === "mouse") {
        const i = this.pickAt(e.clientX, e.clientY);
        if (i !== this.hover) {
          if (this.hover >= 0) this.tileMats[this.hover].emissive.setScalar(0);
          this.hover = i;
          if (i >= 0) this.tileMats[i].emissive.setRGB(0.1, 0.07, 0.04);
          c.style.cursor = i >= 0 ? "pointer" : "";
        }
      }
    };
    const pu = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch0 = 0;
      if (down && !down.moved) {
        const i = this.pickAt(e.clientX, e.clientY);
        if (i >= 0) this.onPick?.(i);
      }
      down = null;
    };
    const wh = (e: WheelEvent) => {
      e.preventDefault();
      this.zoom = THREE.MathUtils.clamp(this.zoom * (1 + Math.sign(e.deltaY) * 0.08), 0.55, 1.35);
    };
    c.addEventListener("pointerdown", pd);
    c.addEventListener("pointermove", pm);
    c.addEventListener("pointerup", pu);
    c.addEventListener("pointercancel", pu);
    c.addEventListener("wheel", wh, { passive: false });
    this.offs.push(
      () => c.removeEventListener("pointerdown", pd),
      () => c.removeEventListener("pointermove", pm),
      () => c.removeEventListener("pointerup", pu),
      () => c.removeEventListener("pointercancel", pu),
      () => c.removeEventListener("wheel", wh),
    );
  }
  /** Back to the camera's own turn (a new turn). */
  resetOrbit() {
    this.orbit = 0;
    this.zoom = 1;
  }

  // ---- the frame ---------------------------------------------------------------------------------

  private resize() {
    const w = this.canvas.parentElement?.clientWidth || window.innerWidth;
    const h = this.canvas.parentElement?.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, true);
    this.camera.aspect = w / h;
    this.applyOffset();
  }
  /** The board sits in the middle of what the HUD leaves free. */
  private applyOffset() {
    const w = this.canvas.clientWidth || 1,
      h = this.canvas.clientHeight || 1;
    const dx = (this.insets.left - this.insets.right) / 2;
    const dy = (this.insets.top - this.insets.bottom) / 2;
    this.camera.setViewOffset(w, h, -dx, -dy, w, h);
    this.camera.updateProjectionMatrix();
  }

  private frame(dt: number) {
    this.time += dt;
    const sdt = dt * Math.min(this.speed, 50);
    let moving = this.shadowsDirty;
    if (this.tweens.length) {
      const list = this.tweens;
      for (let k = 0; k < list.length; k++) {
        const tw = list[k];
        if (!tw.still) moving = true;
        tw.t += sdt;
        const q = Math.min(1, tw.t / tw.d);
        tw.f(q);
        if (q >= 1) {
          list.splice(k--, 1);
          tw.done();
        }
      }
    }
    if (this.roll) moving = true;
    this.stepDice(dt);
    for (const c of this.chips) {
      if (!c.live) continue;
      moving = true;
      c.t += sdt;
      if (c.t < 0) continue;
      const q = Math.min(1, c.t / c.d);
      c.m.visible = true;
      c.m.position.lerpVectors(c.a, c.b, q);
      c.m.position.y += Math.sin(q * Math.PI) * 1.0;
      c.m.rotation.set(q * c.spin, 0, q * c.spin * 0.6);
      if (q >= 1) ((c.live = false), (c.m.visible = false));
    }
    for (const p of this.pawns) {
      if (p.out) {
        p.av.sync(dt, this.time);
        continue;
      }
      if (!p.hopping) {
        const k = 1 - Math.exp(-10 * sdt);
        const dx = p.home.x - p.av.pos.x,
          dz = p.home.z - p.av.pos.z;
        if (dx * dx + dz * dz > 1e-6) moving = true;
        p.av.pos.x += dx * k;
        p.av.pos.z += dz * k;
        p.av.pos.y = TH;
        p.av.face(Math.atan2(-p.av.pos.x, -p.av.pos.z), dt, 4);
      }
      p.av.sync(dt, this.time);
    }
    if (this.active >= 0 && this.activeRing.visible) {
      const p = this.pawns[this.active].av.pos;
      const pulse = 1 + Math.sin(this.time * 3.2) * 0.06;
      this.activeRing.position.set(p.x, TH + 0.006, p.z);
      this.activeRing.scale.setScalar(pulse);
      this.activePool.position.set(p.x, TH + 0.005, p.z);
      this.activePool.scale.setScalar(1.25 * pulse);
    }
    // the Foundries breathe a little smoke
    for (const s of this.smoke) {
      s.t -= sdt;
      if (s.t <= 0) {
        s.t = 1.1 + Math.random() * 0.8;
        this.fx.burst(s.at, 1, ["#6b625a", "#857c74"], { speed: 0.15, up: 0.5, gravity: -0.6, size: 0.07, life: 1.8, drag: 1.2 });
      }
    }
    this.potLabel.quaternion.copy(this.camera.quaternion);
    this.fx.update(sdt);
    this.target(this.eye, this.at);
    this.cam.to(this.eye, this.at, dt, 2.4);
    this.cam.apply(dt);
    if (moving) this.renderer.shadowMap.needsUpdate = true;
    this.shadowsDirty = false;
    this.renderer.render(this.scene, this.camera);
  }

  /** Where a token's head is on the screen (CSS pixels), for speech bubbles. */
  screenOf(seat: number, out = { x: 0, y: 0, on: false }) {
    const p = this.pawns[seat].av.pos;
    return this.project(tmpV.set(p.x, p.y + 0.72, p.z), out);
  }
  /** Where a deck is on the screen (for a card flying off it). */
  deckScreen(deck: "mempool" | "qip", out = { x: 0, y: 0, on: false }) {
    return this.project(tmpV.set(deck === "mempool" ? -DECK_X : DECK_X, TH + 0.3, 0), out);
  }
  /** Where a space is on the screen. */
  spaceScreen(i: number, out = { x: 0, y: 0, on: false }) {
    return this.project(local(i, 0, 0, tmpV, TH), out);
  }
  private project(v: THREE.Vector3, out: { x: number; y: number; on: boolean }) {
    v.project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    out.x = r.left + ((v.x + 1) / 2) * r.width;
    out.y = r.top + ((1 - v.y) / 2) * r.height;
    out.on = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
    return out;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.ro.disconnect();
    for (const f of this.offs) f();
    for (const t of this.tweens) t.done();
    this.tweens = [];
    this.roll?.resolve?.();
    this.roll = null;
    for (const p of this.pawns) p.av.dispose();
    this.pledgedTex?.dispose();
    for (const t of this.coinTex) t.dispose();
    this.coinBack.dispose();
    for (const [a, b] of this.shapes.values()) (a.dispose(), b.dispose());
    this.voxMat.dispose();
    this.litMat.dispose();
    disposeScene(this.scene);
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
    this.canvas.remove();
  }
}

/** A block of a voxel model: colour, size (w, h, d), centre (x, y, z). */
type Part = [string, number, number, number, number, number, number];
const col = new THREE.Color();
/** Blocks merged into one geometry, coloured per vertex (one draw for a whole model). */
function voxels(parts: Part[]) {
  const geos = parts.map(([c, w, h, d, x, y, z]) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.deleteAttribute("uv");
    g.translate(x, y, z);
    col.set(c);
    const n = g.attributes.position.count;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) (a[i * 3] = col.r), (a[i * 3 + 1] = col.g), (a[i * 3 + 2] = col.b);
    g.setAttribute("color", new THREE.BufferAttribute(a, 3));
    return g;
  });
  const m = mergeGeometries(geos, false)!;
  for (const g of geos) g.dispose();
  return m;
}

/** Grain over a painted canvas (the table's wood). */
function paperFillOver(g: CanvasRenderingContext2D, S: number) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = S;
  const x = cv.getContext("2d")!;
  paperFill(x, S, S, "#808080", 1);
  g.save();
  g.globalCompositeOperation = "overlay";
  g.globalAlpha = 0.35;
  g.drawImage(cv, 0, 0);
  g.restore();
}

/** A paper tag with a word, centred on (0, 0) (the pot's label). */
function paperTag(g: CanvasRenderingContext2D, s: string) {
  g.fillStyle = "rgba(0,0,0,0.35)";
  g.beginPath();
  g.roundRect(-112, -34, 224, 76, 8);
  g.fill();
  paperRect(g, -114, -40, 228, 76);
  g.font = `800 44px "BB Cond", "Barlow Condensed", Geist, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "#3f8a5a";
  g.fillText(s, 0, 0);
}
function paperRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  g.fillStyle = "#ece4d3";
  g.beginPath();
  g.roundRect(x, y, w, h, 8);
  g.fill();
  g.strokeStyle = "#3f8a5a";
  g.lineWidth = 4;
  g.beginPath();
  g.roundRect(x + 7, y + 7, w - 14, h - 14, 5);
  g.stroke();
}

// ---- the dice's throw ------------------------------------------------------------------------------

const FACES: [THREE.Vector3, number][] = [
  [new THREE.Vector3(1, 0, 0), 3],
  [new THREE.Vector3(-1, 0, 0), 4],
  [new THREE.Vector3(0, 1, 0), 1],
  [new THREE.Vector3(0, -1, 0), 6],
  [new THREE.Vector3(0, 0, 1), 2],
  [new THREE.Vector3(0, 0, -1), 5],
];
const faceAxis = (n: number) => FACES.find((f) => f[1] === n)![0];

/**
 * Throw two dice from beside a token into the tray: gravity, the felt, the four walls and each
 * other, then a settle onto the nearest face. The record is relabelled (a cube's own symmetry, so
 * nothing visible changes) so that the faces up at rest are the rolled ones.
 */
function simulate(from: THREE.Vector3, want: [number, number]): Throw {
  const HZ = 120;
  const dt = 1 / HZ;
  const G = 24;
  const s = DIE / 2;
  const maxN = HZ * 3;
  const SETTLE = 22;
  const cap = maxN + SETTLE + 1;
  const pos = [new Float32Array(cap * 3), new Float32Array(cap * 3)];
  const rot = [new Float32Array(cap * 4), new Float32Array(cap * 4)];
  const hits: Throw["hits"] = [];
  const P = [new THREE.Vector3(), new THREE.Vector3()];
  const V = [new THREE.Vector3(), new THREE.Vector3()];
  const Q = [new THREE.Quaternion(), new THREE.Quaternion()];
  const W = [new THREE.Vector3(), new THREE.Vector3()];
  const inTray = [false, false];
  const m = new THREE.Matrix4();
  const dq = new THREE.Quaternion();
  const roll = new THREE.Vector3();
  // aim: from over the token toward the far half of the tray
  const dir = tmpV.set(from.x, 0, from.z);
  if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
  dir.normalize();
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  for (let k = 0; k < 2; k++) {
    P[k].set(from.x, TH + 1.05, from.z).addScaledVector(side, (k - 0.5) * 0.3);
    const land = new THREE.Vector3().addScaledVector(dir, rnd(-0.2, 0.35)).addScaledVector(side, (k - 0.5) * 0.9 + rnd(-0.3, 0.3));
    land.x = THREE.MathUtils.clamp(land.x, -TRAY_W / 2 + 0.4, TRAY_W / 2 - 0.4);
    land.z = THREE.MathUtils.clamp(land.z, -TRAY_D / 2 + 0.4, TRAY_D / 2 - 0.4);
    const T = THREE.MathUtils.clamp(Math.hypot(land.x - P[k].x, land.z - P[k].z) / 7.5, 0.45, 0.8);
    V[k].set((land.x - P[k].x) / T, 0, (land.z - P[k].z) / T);
    V[k].y = (FELT + s - P[k].y + 0.5 * G * T * T) / T;
    Q[k].setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
    W[k].set(rnd(-14, 14), rnd(-8, 8), rnd(-14, 14));
  }
  let n = 0;
  let rest = 0;
  for (let it = 0; it < maxN; it++) {
    n = it;
    let still = true;
    for (let k = 0; k < 2; k++) {
      const p = P[k],
        v = V[k],
        w = W[k];
      v.y -= G * dt;
      p.addScaledVector(v, dt);
      const wl = w.length();
      if (wl > 1e-4) {
        dq.setFromAxisAngle(roll.copy(w).divideScalar(wl), wl * dt);
        Q[k].premultiply(dq).normalize();
      }
      // the lowest corner under the centre
      m.makeRotationFromQuaternion(Q[k]);
      const e = m.elements;
      const low = s * (Math.abs(e[1]) + Math.abs(e[5]) + Math.abs(e[9]));
      if (!inTray[k] && Math.abs(p.x) < TRAY_W / 2 && Math.abs(p.z) < TRAY_D / 2 && p.y - low < TH + WALL_H + 0.02) inTray[k] = true;
      const floor = inTray[k] || (Math.abs(p.x) < TRAY_W / 2 + 0.2 && Math.abs(p.z) < TRAY_D / 2 + 0.2) ? FELT : TH;
      if (p.y - low <= floor) {
        p.y = floor + low;
        if (v.y < 0) {
          const imp = -v.y;
          if (imp > 0.8) hits.push({ f: n, kind: "floor", s: Math.min(1, imp / 7) });
          v.y = imp > 0.9 ? imp * 0.38 : 0;
          v.x *= 0.8;
          v.z *= 0.8;
          // the felt's grip turns the spin into a roll along the way it travels
          roll.set(v.z, 0, -v.x).divideScalar(s * 1.6);
          w.multiplyScalar(0.55).addScaledVector(roll, 0.45);
        } else {
          v.x *= 1 - 3.2 * dt;
          v.z *= 1 - 3.2 * dt;
          roll.set(v.z, 0, -v.x).divideScalar(s * 1.6);
          w.lerp(roll, 0.08).multiplyScalar(1 - 2.2 * dt);
        }
      }
      if (inTray[k]) {
        const hx = TRAY_W / 2 - s * 1.05,
          hz = TRAY_D / 2 - s * 1.05;
        if (Math.abs(p.x) > hx) {
          p.x = Math.sign(p.x) * hx;
          if (Math.sign(v.x) === Math.sign(p.x)) {
            if (Math.abs(v.x) > 0.6) hits.push({ f: n, kind: "wall", s: Math.min(1, Math.abs(v.x) / 6) });
            v.x *= -0.45;
            w.multiplyScalar(0.7);
            w.y += rnd(-4, 4);
          }
        }
        if (Math.abs(p.z) > hz) {
          p.z = Math.sign(p.z) * hz;
          if (Math.sign(v.z) === Math.sign(p.z)) {
            if (Math.abs(v.z) > 0.6) hits.push({ f: n, kind: "wall", s: Math.min(1, Math.abs(v.z) / 6) });
            v.z *= -0.45;
            w.multiplyScalar(0.7);
            w.y += rnd(-4, 4);
          }
        }
      }
      if (v.length() > 0.12 || w.length() > 1.2 || p.y - low > floor + 0.004) still = false;
    }
    // the two dice knock together
    const dx = P[1].x - P[0].x,
      dz = P[1].z - P[0].z,
      dy = P[1].y - P[0].y;
    const dist = Math.hypot(dx, dy, dz);
    const minD = DIE * 1.08;
    if (dist < minD && dist > 1e-4) {
      const nx = dx / dist,
        ny = dy / dist,
        nz = dz / dist;
      const push = (minD - dist) / 2;
      P[0].x -= nx * push;
      P[0].z -= nz * push;
      P[1].x += nx * push;
      P[1].z += nz * push;
      const rv = (V[1].x - V[0].x) * nx + (V[1].y - V[0].y) * ny + (V[1].z - V[0].z) * nz;
      if (rv < 0) {
        const j = -rv * 0.75;
        V[0].x -= nx * j;
        V[0].z -= nz * j;
        V[1].x += nx * j;
        V[1].z += nz * j;
        if (-rv > 0.5) hits.push({ f: n, kind: "dice", s: Math.min(1, -rv / 5) });
        W[0].y += rnd(-5, 5);
        W[1].y += rnd(-5, 5);
      }
    }
    for (let k = 0; k < 2; k++) {
      pos[k].set([P[k].x, P[k].y, P[k].z], n * 3);
      rot[k].set([Q[k].x, Q[k].y, Q[k].z, Q[k].w], n * 4);
    }
    if (still) rest++;
    else rest = 0;
    if (rest > 8 && n > HZ * 0.6) break;
  }
  // settle: tip each die onto its nearest face, flat on the felt (n: the last frame recorded)
  const settle = SETTLE;
  const fix: THREE.Quaternion[] = [];
  for (let k = 0; k < 2; k++) {
    let best = FACES[0][0],
      bd = -2;
    for (const [ax] of FACES) {
      const d = tmpV2.copy(ax).applyQuaternion(Q[k]).y;
      if (d > bd) ((bd = d), (best = ax));
    }
    const upNow = tmpV2.copy(best).applyQuaternion(Q[k]);
    const align = tmpQ.setFromUnitVectors(upNow, UP);
    const q1 = Q[k].clone().premultiply(align).normalize();
    const q0 = Q[k].clone();
    const y0 = P[k].y;
    for (let j = 1; j <= settle; j++) {
      const t = easeOut(j / settle);
      const q = q0.clone().slerp(q1, t);
      const f = n + j;
      pos[k].set([P[k].x, y0 + (FELT + s - y0) * t, P[k].z], f * 3);
      rot[k].set([q.x, q.y, q.z, q.w], f * 4);
    }
    // the face that ends up: `best`; relabel so the wanted face sits there
    fix.push(new THREE.Quaternion().setFromUnitVectors(faceAxis(want[k]), best));
  }
  const total = n + settle + 1;
  if (settle > 0 && hits.length) hits.push({ f: n + Math.floor(settle * 0.7), kind: "floor", s: 0.12 });
  return { n: total, pos, rot, fix, hits };
}

/** The quaternion that puts face `n` up, then turns it by `yaw`. */
function faceUp(n: number, yaw: number) {
  const q = new THREE.Quaternion().setFromUnitVectors(faceAxis(n), UP);
  return new THREE.Quaternion().setFromAxisAngle(UP, yaw).multiply(q);
}
