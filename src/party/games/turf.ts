/**
 * INSCRIBE! (铭刻！): ZK PARTY's territory brawl. A 16 × 16 board of blank stone tiles floats
 * over ZStreet at dusk; every tile a zkSNARK runs over is inscribed: it flips to its colour and its
 * zkSNARK's own sigil (the mirrored 7 × 7, theme.ts sigilOf) glows on it. Most tiles when the
 * clock runs out wins.
 *
 * Arrows run (screen-relative: up runs away from the camera). B shoves: a short dash; a rival it
 * catches is knocked back, dizzy a moment, and stamped round with your sigil. Z-Blocks drop in
 * (their shadow shows where, a moment before) with an item named after the chain's calls: a BATCH
 * (A throws it ahead: it inscribes a round patch at once; held too long, it goes by itself), a BIG
 * PROOF (a roller three tiles wide, as fat as a Halo 2 proof) or a HASH RUSH (faster legs). With
 * 15 s left: HURRY!, the music picks up, and it is SHIELDED HOUR: the lilac diamond in the middle
 * lights up, its tiles count double.
 *
 * At the bell the board dims and every colour counts up at once, each from round its own snark,
 * the numbers climbing over their heads until only the winner's still runs. Ties go to whoever
 * inscribed more tiles over the whole game.
 *
 * The AIs (by skill): a plan of the richest stretch to inscribe (blank and rival tiles, the shielded
 * tiles when they count double), re-thought more or less often, run more or less straight; they
 * grab the Z-Blocks near them, throw a BATCH where it pays (a tourist wherever it faces), shove who
 * comes close (a pro more often, the leader first) and sidestep a shove coming. They run a touch
 * slower than you (a tourist 13 % slower, a pro 2 %).
 *
 * Three boards (turf-levels/levels.ts): the SKY SLAB (the open square at dusk), the ZK CEMETERY
 * (walled lanes and a crypt room at night; gate tiles rise into walls and sink again every 7.5 s,
 * flashing red first; the AIs find their way round with a breadth-first search over the cells) and
 * BAY PIER (a round deck turning on the sea, carrying everyone round; waves swell over the
 * fullest wedge, it flashes cyan, then the wave washes it back to blank).
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { T } from "../../i18n/lang";
import { CONTENT, FLARE, GLACIER, GOLD, LILAC, drawMark, sealOf } from "../theme";
import { H, W, backOut, clamp, ease, fpx, grow, ord, overPad, rankBy, rr, sfx, shout, sound, text, token, type Input, type Mini, type MiniDef, type Player, type Rnd } from "../kit";
import { music } from "../music";
import { Avatar, CamRig, Fx3, GEO, banner, blob, block, canvasTex, clock, cornerSpot, disposeScene, glow, outline, qBlock, short, skyline, tag, toScreen, toon, toonSteps, world, yawOf, type World } from "../k3";
import { LEVELS, buildCrypt, buildPier, type Scenery, type TurfLevel } from "./turf-levels/levels";
import { dressCrypt, dressPier, dressSlab, type Tick } from "./turf-levels/dress";

// ---- the rules -----------------------------------------------------------------------------------

/** The play time (s); HURRY! with this much left, and MAKERS' HOUR a moment later. */
const TIME = 45;
const HURRY_AT = TIME - 15;
const MAKERS_AT = HURRY_AT + 1.5;
/** The board: N × N tiles, TS apart (m), TH thick, GAP between them. */
const N = 16;
const NT = N * N;
const TS = 1.2;
const HALF = (N * TS) / 2;
const TH = 0.5;
const GAP = 0.08;
/** The snarks: size, body radius, top speed (m/s), how quick they reach it (per s). */
const SIZE = 1.18;
const PR = 0.42;
const SPEED = 6.1;
const ACC = 13;
/** The shove: its speed, how long, the wait before the next, the slow get-up after it. */
const DASH_V = 13.5;
const DASH_T = 0.2;
const DASH_CD = 1.7;
const DASH_REC = 0.14;
/** B held a moment: pressed dizzy, or just before the shove is ready again, it goes as soon as it can. */
const BBUF = 0.15;
/** A shove that lands: the knock (m/s), the dizzy spell, then a moment no one can shove you again. */
const KNOCK = 9.5;
const DIZZY = 1.0;
const IMMUNE = 0.9;
/** Stamp rings (in tiles², round the spot): a shove's (13 tiles), a BATCH's (21). */
const STAMP_R2 = 4.2;
const BATCH_R2 = 5.1;
/** The BATCH: how far it flies, how long, when it goes by itself. */
const BATCH_RANGE = 4.6;
const BATCH_FLY = 0.55;
const BATCH_AUTO = 6;
/** The other items' seconds, the rush's speed. */
const BIGSIG_T = 5;
const RUSH_T = 4;
const RUSH_K = 1.4;
/** Z-Blocks: the first, then one every…, the shadow's warning, how long one waits, how many at once. */
const QB_FIRST = 2.4;
const QB_EVERY = 4.2;
const QB_EVERY_HURRY = 2.8;
const QB_WARN = 1.3;
const QB_LIFE = 13;
const QB_MAX = 2;
const QB_MAX_HURRY = 3;
/** The items: a BATCH bomb, a BIG PROOF roller, a HASH RUSH. */
const BATCH = 0;
const BIGSIG = 1;
const RUSH = 2;
const ITEM_C = ["#ff4a5a", LILAC, "#7fd3ee"];
/** The end: "TIME!" held, then the count (s). */
const TIME_HOLD = 1.0;
const TALLY_T = 3.3;
/** The city, far below. */
const CITY_Y = -64;

/** The tally's dimming, the shielded glyphs' glow (additive), the twists' warnings. */
const WHITE = new THREE.Color("#ffffff");
const DIM = new THREE.Color("#140f26");
const GLYPH_MAKERS = new THREE.Color("#ffffff");
const WARN_GATE = new THREE.Color("#ff3348");
const WARN_OPEN = new THREE.Color("#b8ffd0");
const WARN_WAVE = new THREE.Color("#9ff3ff");
/** The cells: a tile, a wall, a gate tile (risen first: A), nothing (the deck's plate). */
const C_TILE = 0,
  C_WALL = 1,
  C_GATE_A = 2,
  C_GATE_B = 3,
  C_VOID = 4;
const INK = "#15101f";
/** The glyph atlas's cells: the four seats' sigils, a blank stone's lattice, the shielded mark. */
const CELL_BLANK = 4;
const CELL_MAKERS = 5;

const tileX = (i: number) => ((i % N) + 0.5) * TS - HALF;
const tileZ = (i: number) => (Math.floor(i / N) + 0.5) * TS - HALF;

interface Run {
  i: number;
  a: Avatar;
  p: Player;
  vx: number;
  vz: number;
  /** A knock's own velocity (it fades). */
  kx: number;
  kz: number;
  /** Facing (unit): a shove or a BATCH goes there. */
  dx: number;
  dz: number;
  dash: number;
  cd: number;
  /** The human's B held a moment (pressed dizzy or a moment before the shove is ready, it still goes). */
  bbuf: number;
  rec: number;
  stun: number;
  immune: number;
  spin: number;
  bigsig: number;
  rush: number;
  batches: number;
  held: number;
  /** The AI: next think, its target spot, a Z-Block it goes for, its wobble, a grudge, a dodge. */
  think: number;
  tx: number;
  tz: number;
  goal: number;
  wob: number;
  rev: number;
  revT: number;
  dodge: number;
  ddx: number;
  ddz: number;
  idleT: number;
  /** The way through the walls (cells, from where it stood to its target), the next one, a stuck clock. */
  path: Int16Array;
  plen: number;
  pk: number;
  stuck: number;
  /** The human's inscribing run (its notes climb). */
  combo: number;
  comboT: number;
  angryT: number;
  /** Gear: the BIG PROOF roller, the BATCH over the head, the rush's ring. */
  rollerG: THREE.Group;
  batchG: THREE.Group;
  rushRing: THREE.Mesh;
}

interface QB {
  m: THREE.Mesh;
  icon: THREE.Sprite;
  shadow: THREE.Mesh;
  ring: THREE.Mesh;
  x: number;
  z: number;
  kind: number;
  t0: number;
  /** 0 off, 1 coming down, 2 landed. */
  st: number;
  sq: number;
}

interface Shot {
  g: THREE.Group;
  band: THREE.Mesh;
  mark: THREE.Mesh;
  on: boolean;
  seat: number;
  fx: number;
  fy: number;
  fz: number;
  tx: number;
  tz: number;
  t: number;
}

interface Pop {
  seat: number;
  s: string;
  c: string;
  t: number;
  big: boolean;
}

// ---- textures and shapes -------------------------------------------------------------------------

function star(g: CanvasRenderingContext2D, x: number, y: number, r1: number, r0: number, n = 5) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    const r = i % 2 ? r0 : r1;
    g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
}

function circle(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

/** A sigil (7 × 7, mirrored) in `c`, `cs` a cell, centred on (cx, cy). */
function drawSigil(g: CanvasRenderingContext2D, sig: number[][], cx: number, cy: number, cs: number, c: string) {
  g.fillStyle = c;
  for (let y = 0; y < 7; y++)
    for (let x = 0; x < 7; x++) {
      const v = sig[y][x];
      if (!v) continue;
      g.globalAlpha = v === 2 ? 1 : 0.86;
      g.beginPath();
      g.roundRect(cx + (x - 3.5) * cs + cs * 0.08, cy + (y - 3.5) * cs + cs * 0.08, cs * 0.84, cs * 0.84, cs * 0.2);
      g.fill();
    }
  g.globalAlpha = 1;
}

/** A rhombus of nine nodes (blank stone's etched pattern). */
function drawLattice(g: CanvasRenderingContext2D, cx: number, cy: number, s: number, dot: number) {
  const node = (i: number, j: number): [number, number] => [cx + (i - j) * s, cy + (i + j - 2) * s];
  g.beginPath();
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      const [x, y] = node(i, j);
      if (i < 2) (g.moveTo(x, y), g.lineTo(...node(i + 1, j)));
      if (j < 2) (g.moveTo(x, y), g.lineTo(...node(i, j + 1)));
    }
  g.stroke();
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) circle(g, ...node(i, j), dot);
}

/** The glyphs a tile can wear (white, tinted and glowing by the instance): 3 × 2 cells of 128. */
function glyphAtlas(sigils: number[][][]) {
  return canvasTex(384, 256, (g) => {
    for (let k = 0; k < 6; k++) {
      const cx = (k % 3) * 128 + 64,
        cy = Math.floor(k / 3) * 128 + 64;
      g.save();
      g.shadowColor = "rgba(255,255,255,0.85)";
      g.shadowBlur = 9;
      g.strokeStyle = g.fillStyle = "#ffffff";
      g.lineCap = "round";
      if (k < 4) {
        // the seal: its ring, the sigil struck inside
        g.globalAlpha = 0.7;
        g.lineWidth = 5;
        g.beginPath();
        g.arc(cx, cy, 50, 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = 1;
        drawSigil(g, sigils[k], cx, cy, 10.5, "#ffffff");
      } else if (k === CELL_BLANK) {
        // blank stone: a faint lattice etched in it
        g.lineWidth = 3;
        g.globalAlpha = 0.8;
        drawLattice(g, cx, cy + 2, 13, 4.5);
      } else {
        // the shielded tiles' mark: the ⓩ (a ring, the Z and its ticks)
        drawMark(g, cx, cy, 112, "#ffffff", "#ffffff");
      }
      g.restore();
    }
  });
}

/** A seat's banner (its pillar's flag, its roller's drum): its colour, its sigil in white, nx × ny times. */
function sigilTex(sig: number[][], color: string, nx = 1, ny = 1) {
  return canvasTex(128 * nx, 128 * ny, (g) => {
    g.fillStyle = color;
    g.fillRect(0, 0, 128 * nx, 128 * ny);
    if (nx === 1 && ny === 1) {
      g.fillStyle = "rgba(255,255,255,0.22)";
      g.fillRect(0, 0, 128, 10);
      g.fillStyle = "rgba(0,0,0,0.18)";
      g.fillRect(0, 118, 128, 10);
    }
    for (let j = 0; j < ny; j++)
      for (let k = 0; k < nx; k++) {
        g.strokeStyle = "rgba(255,255,255,0.8)";
        g.lineWidth = 5;
        g.beginPath();
        g.arc(64 + k * 128, 64 + j * 128, 46, 0, Math.PI * 2);
        g.stroke();
        drawSigil(g, sig, 64 + k * 128, 64 + j * 128, 10, "#ffffff");
      }
  });
}

/** An item's badge (over its Z-Block, and in the HUD): a ring, a disc of its colour, its picture. */
function drawIcon(g: CanvasRenderingContext2D, kind: number, cx: number, cy: number, r: number) {
  const k = r / 60;
  g.save();
  g.translate(cx, cy);
  g.scale(k, k);
  g.fillStyle = INK;
  circle(g, 0, 0, 60);
  g.fillStyle = "#ffffff";
  circle(g, 0, 0, 55);
  g.fillStyle = ITEM_C[kind];
  circle(g, 0, 0, 48);
  g.lineJoin = "round";
  g.strokeStyle = INK;
  if (kind === BATCH) {
    // a batch: nine tiles at once, a fuse's spark
    g.lineWidth = 5;
    for (let y = 0; y < 3; y++)
      for (let x = 0; x < 3; x++) {
        g.fillStyle = (x + y) % 2 ? "#ffffff" : "#ffe1d6";
        g.beginPath();
        g.roundRect(-30 + x * 20, -22 + y * 20, 17, 17, 4);
        g.fill();
        g.stroke();
      }
    g.fillStyle = "#fff36a";
    star(g, 26, -30, 14, 5, 6);
  } else if (kind === BIGSIG) {
    // a fat roller
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(26, -8);
    g.lineTo(30, 4);
    g.lineTo(0, 10);
    g.lineTo(0, 36);
    g.stroke();
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.roundRect(-34, -30, 62, 26, 8);
    g.fill();
    g.lineWidth = 5;
    g.stroke();
    g.fillStyle = "#8a5cff";
    for (let x = -24; x < 22; x += 12) g.fillRect(x, -22, 6, 10);
  } else {
    // a bolt: hashing faster
    g.fillStyle = "#ffffff";
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(8, -40);
    g.lineTo(-22, 6);
    g.lineTo(-2, 6);
    g.lineTo(-10, 40);
    g.lineTo(22, -8);
    g.lineTo(2, -8);
    g.closePath();
    g.fill();
    g.stroke();
  }
  g.restore();
}

function iconTex(kind: number) {
  return canvasTex(128, 128, (g) => drawIcon(g, kind, 64, 64, 62));
}

/** An ink splat (white: tinted by its material), for the shoves' and the BATCHes' bursts. */
function splatTex() {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = "#ffffff";
    circle(g, 64, 64, 34);
    const rnd = (k: number) => (Math.sin(k * 91.7) * 0.5 + 0.5) * 0.8 + 0.2;
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2;
      const d = 30 + rnd(i) * 22;
      circle(g, 64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 7 + rnd(i + 3) * 8);
      g.beginPath();
      g.moveTo(64 + Math.cos(a - 0.22) * 28, 64 + Math.sin(a - 0.22) * 28);
      g.lineTo(64 + Math.cos(a) * d, 64 + Math.sin(a) * d);
      g.lineTo(64 + Math.cos(a + 0.22) * 28, 64 + Math.sin(a + 0.22) * 28);
      g.fill();
    }
    g.fillStyle = "rgba(255,255,255,0.55)";
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      circle(g, 64 + Math.cos(a) * 58, 64 + Math.sin(a) * 58, 3 + rnd(i + 7) * 2);
    }
  });
}

/** A flat five-pointed star (the dizzy stars). */
function starGeo() {
  const sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? 0.06 : 0.15;
    if (i === 0) sh.moveTo(Math.cos(a) * r, -Math.sin(a) * r);
    else sh.lineTo(Math.cos(a) * r, -Math.sin(a) * r);
  }
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: false });
  g.translate(0, 0, -0.025);
  return g;
}

/** A square frame lying on a tile's top (the shielded tiles' border). */
function frameGeo() {
  const o = (TS - GAP) / 2 - 0.01,
    n = o - 0.15;
  const sh = new THREE.Shape();
  sh.moveTo(-o, -o);
  sh.lineTo(o, -o);
  sh.lineTo(o, o);
  sh.lineTo(-o, o);
  sh.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-n, -n);
  hole.lineTo(-n, n);
  hole.lineTo(n, n);
  hole.lineTo(n, -n);
  hole.closePath();
  sh.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.07, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  return g;
}

// ---- sound ---------------------------------------------------------------------------------------

function beep(freq: number, dur: number, type: OscillatorType, vol: number, slide = 0, delay = 0) {
  const s = sound();
  if (!s) return;
  const { ac, bus } = s;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + dur + 0.02);
}

let noiseBuf: AudioBuffer | null = null;
/** A wet stamp: a burst of low noise and a bloop. */
function splat(vol: number) {
  const s = sound();
  if (!s) return;
  const { ac, bus } = s;
  if (!noiseBuf || noiseBuf.sampleRate !== ac.sampleRate) {
    const n = Math.floor(ac.sampleRate * 0.3);
    noiseBuf = ac.createBuffer(1, n, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
  }
  const t = ac.currentTime;
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  const f = ac.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.setValueAtTime(2400, t);
  f.frequency.exponentialRampToValueAtTime(300, t + 0.25);
  const g = ac.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(bus);
  src.start(t);
  beep(320, 0.2, "sine", vol * 0.9, 0.3);
}

/** The human's inscribing run: a pentatonic climb. */
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

// ---- the game ------------------------------------------------------------------------------------

class Inscribe implements Mini {
  private w: World;
  /** The board played (its key: the bench's sims read it). */
  readonly lv: TurfLevel;
  readonly levelKey: string;
  private run: Run[];
  private fx: Fx3;
  private cam: CamRig;
  private human: number;
  // the board
  /** The board and all on it (it turns on the pier). */
  private deck = new THREE.Group();
  private ang = 0;
  private spin = 0;
  private ca = 1;
  private sa = 0;
  /** Each cell's kind, whether it is a tile, a gate's lift (m), the tiles' number. */
  private kind = new Uint8Array(NT);
  private isTile = new Uint8Array(NT);
  private lift = new Float32Array(NT);
  private nTiles = 0;
  private home: [number, number][];
  private blank: THREE.Color[];
  private makersStone: THREE.Color[];
  private glyphBlank: THREE.Color;
  private scenery: Scenery | null = null;
  /** The set dressing's life (flocks, mist, foam…), ticked with the decor. */
  private dress: Tick | null = null;
  private warnFx = 0;
  // the gates (the graveyard): which set is up (0: A), the next shift, its warning
  private gateUp = 0;
  private gateNext = 99;
  private gateWarn = false;
  private gateCells: number[] = [];
  private gateMesh: THREE.InstancedMesh | null = null;
  private gateInk: THREE.InstancedMesh | null = null;
  /** How many shifts have been warned (the first is announced). */
  private gateMove = 0;
  // the waves (the pier): the next, its wedge, each tile's wedge, the voxel wave
  private waveI = 0;
  private waveWedge = -1;
  private wedgeOf = new Int8Array(NT).fill(-1);
  private waveMesh: THREE.InstancedMesh | null = null;
  /** The wedge the wave will wash, marked on the deck (a glowing sector, its stripes running in). */
  private waveMark: THREE.Mesh | null = null;
  private waveMarkMat: THREE.MeshBasicMaterial | null = null;
  private lastWedge = -1;
  // (the maze's search: distances, the way back, a queue)
  private dist = new Int16Array(NT);
  private prev = new Int16Array(NT);
  private queue = new Int16Array(NT);
  private tmpPath = new Int16Array(NT);
  private tiles!: THREE.InstancedMesh;
  private glyphs!: THREE.InstancedMesh;
  private cells!: THREE.InstancedBufferAttribute;
  private frames!: THREE.InstancedMesh;
  private own = new Int8Array(NT).fill(-1);
  /** What the tile shows (a flip turns over to `own` half way). */
  private shown = new Int8Array(NT).fill(-1);
  private cellOf = new Int8Array(NT).fill(-1);
  private maker = new Uint8Array(NT);
  private makerIdx = new Int16Array(NT).fill(-1);
  private makerN = 0;
  private animT = new Float32Array(NT);
  private animK = new Uint8Array(NT);
  private animAx = new Float32Array(NT);
  private animAz = new Float32Array(NT);
  private inAnim = new Uint8Array(NT);
  private anim = new Int32Array(NT);
  private animN = 0;
  /** The tally: tiles counted show bright, the rest dim. */
  private lit = new Uint8Array(NT);
  private cnt = [0, 0, 0, 0];
  private makerOwn = [0, 0, 0, 0];
  private flips = [0, 0, 0, 0];
  private makersOn = false;
  private makersK = 0;
  // the props
  private bulbs!: THREE.InstancedMesh;
  private nBulbs = 0;
  private bulbPos: number[] = [];
  private dizzy!: THREE.InstancedMesh;
  private qbs: QB[] = [];
  private shots: Shot[] = [];
  private pows: { m: THREE.Mesh; mat: THREE.MeshBasicMaterial; t: number; s: number }[] = [];
  private aim!: THREE.Mesh;
  private aimFill!: THREE.Mesh;
  private deco: THREE.Object3D[] = [];
  private flags: THREE.Mesh[] = [];
  private sculpt: THREE.Group | null = null;
  private cloudMesh: THREE.InstancedMesh | null = null;
  /** Each chase light's wedge (the pier: its lights flash where the wave will come). */
  private bulbWedge: Int8Array | null = null;
  /** The rim: the round deck's inner face (m); the square's inner half width is HALF. */
  private rimIn = 0;
  private rimOut = HALF + 0.55;
  /** The wave's sweep: its wedge, its clock. */
  private sweepW = -1;
  private spinK = 0;
  private sweepT = 0;
  private warnC = WARN_GATE;
  private bandGeo = new THREE.TorusGeometry(0.31, 0.065, 8, 28);
  private iconMats: THREE.SpriteMaterial[];
  private sigils: number[][][];
  private glyphC: THREE.Color[];
  // time
  private phase: "card" | "count" | "play" | "time" | "tally" | "done" = "card";
  private t = 0;
  private pt = 0;
  private clk = 0;
  private qbNext = QB_FIRST;
  private said = { hurry: false, makers: false, five: -1 };
  private news: { s: string; c: string; t: number; d: number; size: number }[] = [];
  private pops: Pop[] = [];
  private bump = [0, 0, 0, 0];
  private plipAt = 0;
  // the end
  private order: number[] | null = null;
  private done: number[] | null = null;
  private tallyList: Int16Array[] = [];
  private tallyPtr = [0, 0, 0, 0];
  private tallyPts = [0, 0, 0, 0];
  private tallyMax = 0;
  private tallyTick = 0;
  private finished = [false, false, false, false];
  private winT = -1;
  private countFrom: { eye: THREE.Vector3; at: THREE.Vector3 } | null = null;
  // (scratch: the frame makes no garbage)
  private v = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private eye = new THREE.Vector3();
  private at = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private m4 = new THREE.Matrix4();
  private m5 = new THREE.Matrix4();
  private m6 = new THREE.Matrix4();
  /** A glyph's place on its tile: on top, or (half way through a flip) on the face coming up. */
  private decTop = new THREE.Matrix4();
  private decBot = new THREE.Matrix4();
  private flipX = new THREE.Matrix4().makeRotationX(Math.PI);
  private sc = new THREE.Vector3(1, 1, 1);
  private col = new THREE.Color();
  private seatC: THREE.Color[][];
  private UP = new THREE.Vector3(0, 1, 0);
  private pts = [0, 0, 0, 0];
  private hudPts = [0, 0, 0, 0];
  private lx = [0, 0, 0, 0];
  private ly = [0, 0, 0, 0];
  private lon = [false, false, false, false];
  private spot = [0, 0];
  private spot2 = [0, 0];
  private fwx = 0;
  private fwz = -1;
  /** The bench: &turfdbg publishes the phase and a scripted human's hint (window.__turf). */
  private dbg = typeof location !== "undefined" && location.pathname.includes("partylab") && location.search.includes("turfdbg");
  stats = { shoves: 0, hits: 0, batches: 0, items: 0 };

  constructor(
    private players: Player[],
    private rnd: Rnd,
    lv: TurfLevel,
  ) {
    this.lv = lv;
    this.levelKey = lv.key;
    this.w = world({ sky: lv.sky, fog: lv.fog });
    const s = this.w.scene;
    this.human = players.findIndex((p) => p.human);
    // (the slab at dusk: a warm sun still high enough to light the tiles' tops, a lilac sky fill)
    this.w.sun.position.set(...lv.sun.pos);
    this.w.sun.color.set(lv.sun.color);
    this.w.sun.intensity = lv.sun.k;
    this.w.hemi.color.set(lv.hemi.sky);
    this.w.hemi.groundColor.set(lv.hemi.ground);
    this.w.hemi.intensity = lv.hemi.k;
    this.home = lv.homes;
    this.blank = lv.blank.map((c) => new THREE.Color(c));
    this.makersStone = lv.makersStone.map((c) => new THREE.Color(c));
    this.glyphBlank = new THREE.Color(lv.glyphBlank);
    this.spin = lv.spin ?? 0;
    if (lv.round) ((this.rimIn = (lv.round + 0.75) * TS), (this.rimOut = this.rimIn + 0.55));
    this.layout();
    this.seatC = players.map((p) => {
      const c = new THREE.Color(p.color);
      return [c.clone(), c.clone().lerp(WHITE, 0.1)];
    });
    this.glyphC = players.map((p) => new THREE.Color(p.color).lerp(WHITE, 0.5).multiplyScalar(0.9));
    // every player's own zkSNARK sigil (from its number)
    this.sigils = players.map((p) => sealOf(p.id).sigil);
    this.iconMats = [0, 1, 2].map((k) => new THREE.SpriteMaterial({ map: iconTex(k), depthWrite: false }));
    this.decTop.compose(new THREE.Vector3(0, TH / 2 + 0.012, 0), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2), new THREE.Vector3(0.9, 0.9, 1));
    this.decBot.multiplyMatrices(this.flipX, this.decTop);
    this.fx = new Fx3(s, 1100);
    s.add(this.deck);
    this.buildBoard(s);
    const kit = { scene: s, fx: this.fx, half: HALF, rimOut: this.rimOut };
    if (lv.key === "crypt") ((this.scenery = buildCrypt(kit)), this.buildCity(s, true));
    else if (lv.key === "pier") this.scenery = buildPier(kit);
    else (this.buildDecor(s), this.buildCity(s, false));
    const dk = { scene: s, deck: this.deck, fx: this.fx, half: HALF, rimOut: this.rimOut };
    if (lv.key === "crypt") {
      const walls: number[] = [];
      for (let i = 0; i < NT; i++) if (this.kind[i] === C_WALL) walls.push(i);
      this.dress = dressCrypt(dk, walls, tileX, tileZ);
    } else if (lv.key === "pier") this.dress = dressPier(dk, -2.6, this.rimIn + 0.275);
    else this.dress = dressSlab(dk);
    // a back light: it rims the snarks and the props against the board
    const back = new THREE.DirectionalLight(lv.back.color, lv.back.k);
    back.position.set(...lv.back.pos);
    s.add(back, back.target);
    // the four, each in its home corner, its 2 × 2 already inscribed
    this.run = players.map((p, i) => {
      const a = new Avatar(s, p, { scale: SIZE });
      const [hx, hz] = this.home[i];
      for (let dz = 0; dz < 2; dz++)
        for (let dx = 0; dx < 2; dx++) {
          const t = (hz + dz) * N + hx + dx;
          this.own[t] = this.shown[t] = i;
          this.cnt[i]++;
        }
      a.pos.set((hx + 1) * TS - HALF, 0, (hz + 1) * TS - HALF);
      a.yaw = yawOf(-a.pos.x, -a.pos.z);
      a.sync(0);
      return this.makeRun(i, a, p);
    });
    for (let i = 0; i < NT; i++) this.tileColor(i, 0);
    this.flushColors();
    this.cam = new CamRig(this.w.camera);
    this.cardCam(0);
    this.cam.apply(0);
  }

  private makeRun(i: number, a: Avatar, p: Player): Run {
    const s = this.w.scene;
    // the BIG PROOF: a fat drum printed with the seat's sigil, pushed ahead on a handle
    const rollerG = new THREE.Group();
    const axis = new THREE.Group();
    axis.rotation.z = Math.PI / 2;
    axis.position.set(0, 0.3, 1.05);
    rollerG.add(axis);
    const drum = new THREE.Mesh(GEO.cyl, [
      new THREE.MeshToonMaterial({ map: sigilTex(this.sigils[i], p.color, 2, 3), gradientMap: toonSteps(), emissive: new THREE.Color(p.color).multiplyScalar(0.12) }),
      toon("#3a3350"),
      toon("#3a3350"),
    ]);
    drum.scale.set(0.58, 2.5, 0.58);
    outline(drum, 0.045);
    axis.add(drum);
    const handle = block("#3a3350", 0.1, 0.1, 1.15, 0, 0.78, 0.62, rollerG);
    handle.rotation.x = -0.95;
    rollerG.visible = false;
    a.root.add(rollerG);
    // the BATCH held over the head
    const batchG = this.batchModel(p.color);
    batchG.position.set(0, 2.22 * SIZE, 0.05);
    batchG.visible = false;
    a.root.add(batchG);
    // the rush: a spinning ring of light round the feet
    const rushRing = new THREE.Mesh(GEO.ring, glow(GLACIER, 0.95, true));
    rushRing.rotation.x = -Math.PI / 2;
    rushRing.scale.setScalar(2.1);
    rushRing.visible = false;
    rushRing.renderOrder = 4;
    s.add(rushRing);
    const dx = -Math.sign(a.pos.x) * Math.SQRT1_2,
      dz = -Math.sign(a.pos.z) * Math.SQRT1_2;
    return {
      i,
      a,
      p,
      vx: 0,
      vz: 0,
      kx: 0,
      kz: 0,
      dx,
      dz,
      dash: 0,
      cd: 0,
      bbuf: 0,
      rec: 0,
      stun: 0,
      immune: 0,
      spin: 0,
      bigsig: 0,
      rush: 0,
      batches: 0,
      held: 0,
      think: 0.05 + this.rnd() * 0.3,
      tx: a.pos.x * 0.4,
      tz: a.pos.z * 0.4,
      goal: -1,
      wob: 0,
      rev: -1,
      revT: 0,
      dodge: 0,
      ddx: 0,
      ddz: 0,
      idleT: 0,
      path: new Int16Array(64),
      plen: 0,
      pk: 0,
      stuck: 0,
      combo: 0,
      comboT: 0,
      angryT: 0,
      rollerG,
      batchG,
      rushRing,
    };
  }

  /** The level's cells: tiles, walls, gates (set A risen at the start), the plate; the waves' wedges. */
  private layout() {
    const lv = this.lv;
    for (let i = 0; i < NT; i++) {
      const ix = i % N,
        iz = Math.floor(i / N);
      let k = C_TILE;
      if (lv.map) {
        const ch = lv.map[iz][ix];
        k = ch === "#" ? C_WALL : ch === "A" ? C_GATE_A : ch === "B" ? C_GATE_B : ch === " " ? C_VOID : C_TILE;
      }
      if (lv.round && Math.hypot(ix - 7.5, iz - 7.5) > lv.round) k = C_VOID;
      this.kind[i] = k;
      this.isTile[i] = k === C_TILE || k === C_GATE_A || k === C_GATE_B ? 1 : 0;
      if (this.isTile[i]) this.nTiles++;
      if (k === C_GATE_A || k === C_GATE_B) this.gateCells.push(i);
      if (k === C_GATE_A) this.lift[i] = lv.gates?.h ?? 0;
      if (lv.waves && this.isTile[i] && Math.hypot(ix - 7.5, iz - 7.5) > lv.waves.hub) {
        const a = Math.atan2(tileZ(i), tileX(i));
        this.wedgeOf[i] = Math.floor(((a + Math.PI) / (Math.PI * 2)) * lv.waves.wedges) % lv.waves.wedges;
      }
    }
    if (lv.gates) this.gateNext = lv.gates.first;
  }

  /** A BATCH: a dark ball, a band of its thrower's colour, a fuse and its spark. */
  private batchModel(color: string) {
    const g = new THREE.Group();
    const ball = new THREE.Mesh(GEO.ball, toon("#221d33", "#0b0816"));
    ball.scale.setScalar(0.62);
    outline(ball, 0.035);
    g.add(ball);
    const band = new THREE.Mesh(this.bandGeo, toon(color));
    band.rotation.x = Math.PI / 2;
    g.add(band);
    block(LILAC, 0.15, 0.12, 0.15, 0, 0.33, 0, g);
    const spark = new THREE.Mesh(GEO.box, glow("#fff1a0", 1, true));
    spark.position.y = 0.45;
    spark.scale.setScalar(0.15);
    g.add(spark);
    g.userData.spark = spark;
    g.userData.band = band;
    return g;
  }

  // ---- building ----------------------------------------------------------------------------------

  private buildBoard(s: THREE.Scene) {
    const d = this.deck;
    const lv = this.lv;
    // the tiles: one instanced draw, rounded voxels with the slab dark between them
    // (a material a shade under white: the dusk light never washes the inks out)
    const geo = new RoundedBoxGeometry(TS - GAP, TH, TS - GAP, 2, 0.085);
    this.tiles = new THREE.InstancedMesh(geo, toon(new THREE.Color(0.8, 0.8, 0.8)), NT);
    this.tiles.setColorAt(0, WHITE);
    // their glyphs: one more draw, each tile's cell of the atlas picked by an instanced attribute
    const gGeo = new THREE.PlaneGeometry(TS - GAP, TS - GAP);
    this.cells = new THREE.InstancedBufferAttribute(new Float32Array(NT * 2), 2);
    gGeo.setAttribute("aCell", this.cells);
    const gMat = new THREE.MeshBasicMaterial({ map: glyphAtlas(this.sigils), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    gMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute vec2 aCell;")
        .replace("#include <uv_vertex>", "#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = vMapUv * vec2(1.0 / 3.0, 0.5) + aCell;\n#endif");
    };
    gMat.customProgramCacheKey = () => "inscribe-glyphs";
    this.glyphs = new THREE.InstancedMesh(gGeo, gMat, NT);
    this.glyphs.setColorAt(0, WHITE);
    this.glyphs.renderOrder = 2;
    // the shielded tiles (their frames rise when they count double)
    for (let i = 0; i < NT; i++) if (this.isTile[i] && this.kind[i] === C_TILE && lv.makers(i % N, Math.floor(i / N))) ((this.maker[i] = 1), (this.makerIdx[i] = this.makerN++));
    // (unlit: a crisp lilac border on any ink)
    this.frames = new THREE.InstancedMesh(frameGeo(), new THREE.MeshBasicMaterial({ color: LILAC }), this.makerN);
    this.frames.setColorAt(0, WHITE);
    for (let i = 0; i < NT; i++) this.placeTile(i, 0, 0);
    this.frames.visible = false;
    this.tiles.frustumCulled = this.glyphs.frustumCulled = this.frames.frustumCulled = false;
    d.add(this.tiles, this.glyphs, this.frames);
    const W2 = N * TS;
    const RW = 0.55,
      RH = 0.36;
    if (lv.round) {
      // the round deck: a ring of rim blocks, white and flare like a lifebuoy, a lip on top
      const Rm = this.rimIn + RW / 2;
      const nSeg = 56;
      const segGeo = new RoundedBoxGeometry(1, 1, 1, 2, 0.08);
      const rim = new THREE.InstancedMesh(segGeo, toon("#ffffff", "#141018"), nSeg);
      const ink = new THREE.InstancedMesh(segGeo, new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }), nSeg);
      const segW = ((Math.PI * 2 * Rm) / nSeg) * 1.04;
      for (let k = 0; k < nSeg; k++) {
        const a = ((k + 0.5) / nSeg) * Math.PI * 2;
        this.q.setFromAxisAngle(this.UP, -Math.PI / 2 - a);
        this.m4.compose(this.v.set(Math.cos(a) * Rm, RH / 2 - 1.1, Math.sin(a) * Rm), this.q, this.sc.set(segW, RH + 2.2, RW));
        rim.setMatrixAt(k, this.m4);
        rim.setColorAt(k, this.col.set(Math.floor(k / 2) % 2 ? lv.lip : lv.rim));
        this.m4.compose(this.v, this.q, this.sc.set(segW + 0.06, RH + 2.28, RW + 0.08));
        ink.setMatrixAt(k, this.m4);
      }
      this.sc.set(1, 1, 1);
      d.add(rim, ink);
      const lip = new THREE.Mesh(new THREE.TorusGeometry(Rm, 0.07, 6, 96), toon("#ffffff"));
      lip.rotation.x = Math.PI / 2;
      lip.position.y = RH + 0.04;
      d.add(lip);
      // (the plate under the tiles, where the round deck has no tile)
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(this.rimIn + 0.05, this.rimIn + 0.05, 0.6, 48), toon("#d9cdb6", "#1a140c"));
      plate.position.y = -0.56;
      d.add(plate);
    } else {
      // the slab under the board, its lip, the rim that holds everyone in
      block(lv.key === "crypt" ? "#241c26" : "#16121f", W2 + 0.1, 1.2, W2 + 0.1, 0, -TH * 0.55 - 0.6, 0, d);
      for (const [x, z, w, dd] of [
        [0, -(HALF + RW / 2), W2 + RW * 2, RW],
        [0, HALF + RW / 2, W2 + RW * 2, RW],
        [-(HALF + RW / 2), 0, RW, W2],
        [HALF + RW / 2, 0, RW, W2],
      ]) {
        const r = block(lv.rim, w, RH + 2.2, dd, x, RH / 2 - 1.1, z, d);
        outline(r, 0.04);
        block(lv.lip, w + 0.06, 0.12, dd + 0.06, x, RH + 0.06, z, d, lv.key === "crypt" ? glow(lv.lip, 0.85) : toon(lv.lip, "#5a1e00"));
      }
    }
    if (lv.key === "slab") {
      // the hull under the board: a dark keel, a flare cube as its core, lilac jets
      const hull = new THREE.Mesh(GEO.cone, toon("#2a2340"));
      hull.rotation.set(Math.PI, Math.PI / 4, 0);
      const side = (W2 + RW * 2) / Math.SQRT1_2;
      hull.scale.set(side, 7, side);
      hull.position.y = -1.3 - 3.5;
      d.add(hull);
      const core = new THREE.Mesh(new RoundedBoxGeometry(2.4, 2.4, 2.4, 3, 0.45), toon(FLARE, "#6a2400"));
      core.position.y = -8.9;
      outline(core, 0.06);
      d.add(core);
      this.deco.push(core);
      const jet = new THREE.Mesh(GEO.disc, glow(LILAC, 0.85, true));
      jet.rotation.x = Math.PI / 2;
      jet.scale.setScalar(3);
      jet.position.y = -10.3;
      d.add(jet);
    }
    if (lv.map) this.buildWalls(d);
    if (lv.waves) {
      // the wave: two rows of voxels along the wedge's rim (water, then the foam on its crest)
      this.waveMesh = new THREE.InstancedMesh(GEO.box, toon("#ffffff", "#0a3040"), 2 * 16);
      for (let k = 0; k < 32; k++) this.waveMesh.setColorAt(k, this.col.set(k < 16 ? (k % 2 ? "#33c4e4" : "#2ab0d6") : "#f4feff"));
      this.waveMesh.visible = false;
      this.waveMesh.frustumCulled = false;
      d.add(this.waveMesh);
      // the warning on the deck: the wedge's sector glows, chevrons pointing in from the sea
      const span = (Math.PI * 2) / lv.waves.wedges;
      const stripes = canvasTex(
        64,
        64,
        (g) => {
          g.fillStyle = "#000000";
          g.fillRect(0, 0, 64, 64);
          g.fillStyle = "#ffffff";
          for (let k = -64; k < 128; k += 32) {
            g.beginPath();
            g.moveTo(k, 0);
            g.lineTo(k + 16, 0);
            g.lineTo(k + 16 + 64, 64);
            g.lineTo(k + 64, 64);
            g.closePath();
            g.fill();
          }
        },
        true,
      );
      stripes.repeat.set(5, 5);
      this.waveMarkMat = new THREE.MeshBasicMaterial({ color: "#5fe0ff", map: stripes, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      this.waveMark = new THREE.Mesh(new THREE.RingGeometry(lv.waves.hub * TS, this.rimIn, 24, 1, -Math.PI, span), this.waveMarkMat);
      // (RingGeometry lies in x-y: laid flat, its angles run the way atan2(z, x) does)
      this.waveMark.rotation.x = Math.PI / 2;
      this.waveMark.position.y = 0.04;
      this.waveMark.renderOrder = 3;
      this.waveMark.visible = false;
      d.add(this.waveMark);
    }
    // the four home pillars by the rim, each in its seat's colour, flying its sigil
    this.players.forEach((p, i) => {
      const hx = (this.home[i][0] + 1) * TS - HALF,
        hz = (this.home[i][1] + 1) * TS - HALF;
      let x: number, z: number;
      if (lv.round) {
        const a = Math.atan2(hz, hx),
          Rm = this.rimIn + RW / 2;
        x = Math.cos(a) * Rm;
        z = Math.sin(a) * Rm;
      } else ((x = Math.sign(hx) * (HALF + RW / 2)), (z = Math.sign(hz) * (HALF + RW / 2)));
      const sx = Math.sign(x) || 1;
      const pc = new THREE.Color(p.color);
      const pil = block(p.color, 1.0, 1.7, 1.0, x, 0.85 - 0.2, z, d, toon(p.color, pc.clone().multiplyScalar(0.15)));
      outline(pil, 0.05);
      const capM = block(p.color, 1.16, 0.2, 1.16, x, 1.55, z, d, glow(pc.clone().lerp(WHITE, 0.35)));
      outline(capM, 0.04);
      block("#2a2340", 0.08, 2.1, 0.08, x, 2.6, z, d);
      // (one material, the sigil on both faces: one draw a flag)
      const flag = new THREE.Mesh(GEO.box, new THREE.MeshToonMaterial({ map: sigilTex(this.sigils[i], p.color), gradientMap: toonSteps(), emissive: pc.clone().multiplyScalar(0.2) }));
      flag.scale.set(1.0, 0.95, 0.04);
      flag.position.set(x - sx * 0.5, 3.15, z);
      flag.userData.x = x;
      flag.userData.sx = sx;
      d.add(flag);
      this.flags.push(flag);
    });
    // the chase lights along the rim
    if (lv.round) {
      const nB = 84,
        Rm = this.rimIn + RW / 2;
      this.bulbWedge = new Int8Array(nB);
      for (let k = 0; k < nB; k++) {
        const a = ((k + 0.5) / nB) * Math.PI * 2;
        this.bulbPos.push(Math.cos(a) * Rm, Math.sin(a) * Rm);
        const aa = Math.atan2(Math.sin(a), Math.cos(a));
        this.bulbWedge[k] = Math.floor(((aa + Math.PI) / (Math.PI * 2)) * (lv.waves?.wedges ?? 6)) % (lv.waves?.wedges ?? 6);
      }
    } else {
      const per = 22;
      for (let side = 0; side < 4; side++)
        for (let k = 0; k < per; k++) {
          const u = ((k + 0.5) / per) * 2 - 1;
          const L = HALF + RW / 2;
          const x = side < 2 ? u * L : side === 2 ? -L : L;
          const z = side < 2 ? (side === 0 ? -L : L) : u * L;
          this.bulbPos.push(x, z);
        }
    }
    this.nBulbs = this.bulbPos.length / 2;
    this.bulbs = new THREE.InstancedMesh(GEO.ball, glow("#ffffff"), this.nBulbs);
    for (let k = 0; k < this.nBulbs; k++) {
      this.m4.compose(this.v.set(this.bulbPos[k * 2], RH + 0.2, this.bulbPos[k * 2 + 1]), this.q.identity(), this.sc.setScalar(0.2));
      this.bulbs.setMatrixAt(k, this.m4);
      this.bulbs.setColorAt(k, WHITE);
    }
    this.sc.set(1, 1, 1);
    d.add(this.bulbs);
    // the dizzy stars (one draw for all)
    this.dizzy = new THREE.InstancedMesh(starGeo(), toon("#fff07a", "#6a5a00"), 12);
    this.dizzy.count = 0;
    this.dizzy.frustumCulled = false;
    s.add(this.dizzy);
    // the Z-Blocks that drop in with an item, their shadows and rings
    for (let k = 0; k < QB_MAX_HURRY; k++) {
      const m = qBlock(0.95);
      m.visible = false;
      const icon = new THREE.Sprite(this.iconMats[0]);
      icon.scale.setScalar(1.05);
      icon.visible = false;
      icon.renderOrder = 6;
      const shadow = blob(0.75);
      shadow.visible = false;
      const ring = new THREE.Mesh(GEO.ring, glow(CONTENT, 0.8, true));
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      ring.renderOrder = 3;
      s.add(m, icon, shadow, ring);
      this.qbs.push({ m, icon, shadow, ring, x: 0, z: 0, kind: 0, t0: 0, st: 0, sq: 0 });
    }
    // the BATCHes in flight and where each will land
    for (let k = 0; k < 4; k++) {
      const g = this.batchModel("#ffffff");
      g.visible = false;
      const mark = new THREE.Mesh(GEO.ring, glow("#ffffff", 0.7, true));
      mark.rotation.x = -Math.PI / 2;
      mark.visible = false;
      mark.renderOrder = 3;
      s.add(g, mark);
      this.shots.push({ g, band: g.userData.band as THREE.Mesh, mark, on: false, seat: 0, fx: 0, fy: 0, fz: 0, tx: 0, tz: 0, t: 0 });
    }
    // the splats of a shove or a BATCH (billboards tinted by whoever threw them)
    const stex = splatTex();
    for (let k = 0; k < 4; k++) {
      const mat = new THREE.MeshBasicMaterial({ map: stex, transparent: true, depthTest: false, depthWrite: false });
      const m = new THREE.Mesh(GEO.plane, mat);
      m.visible = false;
      m.renderOrder = 10;
      s.add(m);
      this.pows.push({ m, mat, t: 9, s: 1 });
    }
    // your BATCH's aim: where it would land
    const hc = this.human >= 0 ? this.players[this.human].color : "#ffffff";
    this.aim = new THREE.Mesh(GEO.ring, glow(hc, 0.75, true));
    this.aimFill = new THREE.Mesh(GEO.disc, glow(hc, 0.22, true));
    for (const m of [this.aim, this.aimFill]) {
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      m.renderOrder = 3;
      s.add(m);
    }
  }

  /** The graveyard's walls (mossy stone, one draw and its ink) and its gates (iron pedestals under their tiles). */
  private buildWalls(d: THREE.Group) {
    const walls: number[] = [];
    for (let i = 0; i < NT; i++) if (this.kind[i] === C_WALL) walls.push(i);
    const WH = 1.65;
    const brick = canvasTex(64, 64, (g) => {
      g.fillStyle = "#a39d92";
      g.fillRect(0, 0, 64, 64);
      g.fillStyle = "#77716a";
      for (let y = 0; y < 64; y += 16) {
        g.fillRect(0, y, 64, 2);
        const o = (y / 16) % 2 ? 0 : 16;
        for (let x = o; x < 64; x += 32) g.fillRect(x, y, 2, 16);
      }
      g.fillStyle = "#6fb36a";
      g.fillRect(0, 0, 64, 7);
      for (let x = 0; x < 64; x += 9) g.fillRect(x, 7, 5, 3 + ((x * 7) % 5));
    });
    const wGeo = new RoundedBoxGeometry(TS, WH, TS, 2, 0.1);
    const wm = new THREE.InstancedMesh(wGeo, new THREE.MeshToonMaterial({ map: brick, gradientMap: toonSteps(), emissive: 0x0c0814 }), walls.length);
    const wi = new THREE.InstancedMesh(wGeo, new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }), walls.length);
    const shades = ["#ffffff", "#e8e4f0", "#f4ecdc"];
    walls.forEach((c, k) => {
      this.m4.compose(this.v.set(tileX(c), WH / 2 - TH, tileZ(c)), this.q.identity(), this.sc.set(1, 1, 1));
      wm.setMatrixAt(k, this.m4);
      wm.setColorAt(k, this.col.set(shades[(c * 7) % 3]));
      this.m4.compose(this.v, this.q, this.sc.set(1.05, 1.04, 1.05));
      wi.setMatrixAt(k, this.m4);
    });
    this.sc.set(1, 1, 1);
    d.add(wm, wi);
    // the gates: an iron pedestal under each gate tile (it lifts the tile into a wall)
    const iron = canvasTex(64, 64, (g) => {
      g.fillStyle = "#4a4262";
      g.fillRect(0, 0, 64, 64);
      g.fillStyle = "#2c2640";
      for (let x = 6; x < 64; x += 14) g.fillRect(x, 0, 5, 64);
      g.fillStyle = "#ff6b35";
      g.fillRect(0, 26, 64, 6);
      g.fillStyle = "#c4b1fc";
      for (let x = 3; x < 64; x += 14) g.fillRect(x, 10, 3, 3);
    });
    const n = this.gateCells.length;
    const pGeo = new THREE.BoxGeometry(TS - GAP - 0.04, 1, TS - GAP - 0.04);
    this.gateMesh = new THREE.InstancedMesh(pGeo, new THREE.MeshToonMaterial({ map: iron, gradientMap: toonSteps(), emissive: 0x100818 }), n);
    this.gateInk = new THREE.InstancedMesh(pGeo, new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }), n);
    this.gateMesh.frustumCulled = this.gateInk.frustumCulled = false;
    d.add(this.gateMesh, this.gateInk);
    this.placeGates();
  }

  /** The gates' pedestals, as high as their tiles stand. */
  private placeGates() {
    if (!this.gateMesh || !this.gateInk) return;
    const GH = this.lv.gates?.h ?? 1;
    this.gateCells.forEach((c, k) => {
      const y = this.lift[c] - TH - GH / 2;
      this.m4.compose(this.v.set(tileX(c), y, tileZ(c)), this.q.identity(), this.sc.set(1, GH, 1));
      this.gateMesh!.setMatrixAt(k, this.m4);
      this.m4.compose(this.v, this.q, this.sc.set(1.06, GH + 0.02, 1.06));
      this.gateInk!.setMatrixAt(k, this.m4);
    });
    this.sc.set(1, 1, 1);
    this.gateMesh.instanceMatrix.needsUpdate = true;
    this.gateInk.instanceMatrix.needsUpdate = true;
  }

  /** Round the board: the ⓩ sculpture (a ring, the golden Z and its ticks), Z-Blocks afloat. */
  private buildDecor(s: THREE.Scene) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.5, 14, 48), toon(CONTENT, "#2a2630"));
    g.add(ring);
    const zMat = toon(GOLD, "#5a3a00");
    // (the Z: two bars and the diagonal between their ends, a tick above and below, as drawMark draws it)
    const [zw, zh, zt] = [0.94, 0.99, 0.6];
    const diag = Math.hypot(zw * 2, zh * 2);
    for (const [w, h, x, y, rz] of [
      [zw * 2 + zt * 0.6, zt, 0, zh, 0],
      [zw * 2 + zt * 0.6, zt, 0, -zh, 0],
      [diag, zt * 0.9, 0, 0, Math.atan2(zh, zw)],
      [zt * 0.85, 0.72, 0, zh + 0.6, 0],
      [zt * 0.85, 0.72, 0, -zh - 0.6, 0],
    ]) {
      const bar = block(GOLD, w, h, zt, x, y, 0, g, zMat);
      bar.rotation.z = rz;
      outline(bar, 0.05);
    }
    g.position.set(-16.5, 3.4, -3.5);
    g.rotation.set(-0.45, 0.75, 0);
    s.add(g);
    this.sculpt = g;
    for (const [x, y, z, sz] of [
      [16.5, 2.8, -3, 1.4],
      [-9, 6, -16.5, 1.1],
      [9.5, 5.2, -17, 1.2],
    ]) {
      const q = qBlock(sz);
      q.position.set(x, y, z);
      q.userData.y = y;
      q.userData.a = x * 0.3 + z;
      s.add(q);
      this.deco.push(q);
    }
  }

  private buildCity(s: THREE.Scene, night: boolean) {
    // the streets far below at dusk (or at night, under the graveyard): dim blocks, lit avenues
    const tex = canvasTex(
      256,
      256,
      (g) => {
        g.fillStyle = "#4a4064";
        g.fillRect(0, 0, 256, 256);
        const pal = ["#6f6590", "#7e6a88", "#62708e", "#856f80", "#577a68", "#86706a"];
        for (let i = 0; i < 4; i++)
          for (let j = 0; j < 4; j++) {
            g.fillStyle = pal[(i * 5 + j * 3) % pal.length];
            g.fillRect(i * 64 + 7, j * 64 + 7, 50, 50);
          }
        g.fillStyle = "#ffc48a";
        for (let i = 0; i < 256; i += 16) (g.fillRect(i, 0, 5, 2), g.fillRect(0, i, 2, 5));
      },
      true,
    );
    tex.repeat.set(30, 30);
    const ground = new THREE.Mesh(GEO.plane, new THREE.MeshToonMaterial({ map: tex, gradientMap: toonSteps(), emissive: 0x150c22, color: night ? 0x6a6090 : 0xffffff }));
    ground.rotation.x = -Math.PI / 2;
    ground.scale.set(1500, 1500, 1);
    ground.position.y = CITY_Y;
    s.add(ground);
    const wtex = canvasTex(
      64,
      128,
      (g) => {
        g.fillStyle = "#fff";
        g.fillRect(0, 0, 64, 128);
        for (let y = 6; y < 128; y += 12)
          for (let x = 5; x < 64; x += 12) {
            g.fillStyle = Math.random() < (night ? 0.55 : 0.42) ? (night && Math.random() < 0.3 ? "#b8ffcf" : "#ffd59a") : "#3c3456";
            g.fillRect(x, y, 7, 7);
          }
      },
      true,
    );
    const cell = 12.5;
    const NN = 26;
    const towers = new THREE.InstancedMesh(GEO.box, new THREE.MeshToonMaterial({ map: wtex, gradientMap: toonSteps(), emissive: 0x2a1c30, emissiveMap: wtex }), NN * NN);
    const pal = night ? ["#5a5280", "#4a4670", "#62588a", "#544a72", "#4c5a78", "#5e4f7a"] : ["#7a6aa6", "#946f9e", "#6a78ad", "#a8788c", "#7f8cb8", "#b07d78", "#8a68b0", "#6f9a98"];
    let n = 0;
    for (let i = 0; i < NN; i++)
      for (let j = 0; j < NN; j++) {
        if (Math.random() < 0.22) continue;
        const x = (i - NN / 2 + 0.5) * cell,
          z = (j - NN / 2 + 0.5) * cell;
        const d = Math.hypot(x, z);
        const w = cell * (0.55 + Math.random() * 0.2);
        const h = 4 + Math.random() * Math.random() * (d < 40 ? 16 : 40);
        this.m4.compose(this.v.set(x, CITY_Y + h / 2, z), this.q.identity(), this.sc.set(w, h, w * (0.8 + Math.random() * 0.4)));
        towers.setMatrixAt(n, this.m4);
        towers.setColorAt(n, this.col.set(pal[(i * 7 + j * 3) % pal.length]));
        n++;
      }
    towers.count = n;
    towers.raycast = () => {};
    s.add(towers);
    skyline(s, { r: 190, n: 80, y: CITY_Y, rnd: Math.random, tall: 0.9, night: true });
    if (night) return;
    // chunky clouds lit by the low sun, under the board and a few far up (one draw)
    const puffs = 4;
    const nC = 16;
    this.cloudMesh = new THREE.InstancedMesh(GEO.box, toon("#ffd8c8", "#5a3468"), nC * puffs);
    let c = 0;
    for (let i = 0; i < nC; i++) {
      const low = i < 11;
      const a = (i / 11) * Math.PI * 2 + Math.random() * 0.5;
      const d = low ? 24 + Math.random() * 50 : 80 + Math.random() * 70;
      const cy = low ? -18 - Math.random() * 18 : 16 + Math.random() * 24;
      const k = low ? 0.9 + Math.random() * 0.6 : 1.4 + Math.random();
      for (let p = 0; p < puffs; p++) {
        const big = p === 1 || p === 2;
        const ox = (p - 1.5) * 3.2 * k,
          oz = (Math.random() - 0.5) * 2.4 * k;
        const w = (big ? 5.2 : 3.6) * k;
        this.m4.compose(this.v.set(Math.cos(a) * d + ox, cy + (big ? 1.2 : 0) * k, Math.sin(a) * d + oz), this.q.identity(), this.sc.set(w, w * 0.78, w * 0.9));
        this.cloudMesh.setMatrixAt(c++, this.m4);
      }
    }
    this.sc.set(1, 1, 1);
    this.cloudMesh.raycast = () => {};
    s.add(this.cloudMesh);
  }

  // ---- the board -----------------------------------------------------------------------------------

  /** The cell under a spot of the world (-1: off the grid; it may be a wall or the plate). */
  private tileAt(x: number, z: number) {
    const lx = x * this.ca - z * this.sa,
      lz = x * this.sa + z * this.ca;
    const ix = Math.floor((lx + HALF) / TS),
      iz = Math.floor((lz + HALF) / TS);
    if (ix < 0 || iz < 0 || ix >= N || iz >= N) return -1;
    return iz * N + ix;
  }

  /** The cell under a spot, kept inside the grid. */
  private cellAt(x: number, z: number) {
    const lx = x * this.ca - z * this.sa,
      lz = x * this.sa + z * this.ca;
    return clamp(Math.floor((lz + HALF) / TS), 0, N - 1) * N + clamp(Math.floor((lx + HALF) / TS), 0, N - 1);
  }

  /** Where cell i is in the world (into this.v; the deck may have turned). */
  private wpos(i: number, y: number) {
    const lx = tileX(i),
      lz = tileZ(i);
    return this.v.set(lx * this.ca + lz * this.sa, y, -lx * this.sa + lz * this.ca);
  }

  /** Is cell c in the way (a wall, a risen gate; for a plan, a gate about to move too)? */
  private solid(c: number, plan = false) {
    const k = this.kind[c];
    if (k === C_WALL) return true;
    // (a gate on its way up is a wall from the shift on: whoever stood on it was bumped off then, and
    // nobody walks onto it in the moment it takes to rise, to be thrown out of it a step later)
    if (k === C_GATE_A || k === C_GATE_B) return this.lift[c] > 0.3 || this.gateUpNow(c) || (plan && this.gateWarn);
    return false;
  }

  /** Will gate c stand up once the shift under way is done? */
  private gateUpNow(c: number) {
    return (this.kind[c] === C_GATE_A) === (this.gateUp === 0);
  }

  /**
   * Put tile i in place: lifted `y`, turned `ang` round the flat axis (ax, az), squashed `sy`; its
   * glyph (and its shielded frame) ride on it, on the face that shows (`under`: the one coming up).
   */
  private placeTile(i: number, y: number, ang: number, ax = 1, az = 0, sy = 1, under = false) {
    if (!this.isTile[i]) {
      // (a wall or the plate: no tile there)
      this.m4.compose(this.v.set(tileX(i), -6, tileZ(i)), this.q.identity(), this.sc.setScalar(1e-4));
      this.sc.set(1, 1, 1);
      this.tiles.setMatrixAt(i, this.m4);
      this.glyphs.setMatrixAt(i, this.m4);
      return;
    }
    if (ang) this.q.setFromAxisAngle(this.v2.set(ax, 0, az), ang);
    else this.q.identity();
    this.m4.compose(this.v.set(tileX(i), -TH / 2 + y + this.lift[i], tileZ(i)), this.q, this.sc.set(1, sy, 1));
    this.sc.set(1, 1, 1);
    this.tiles.setMatrixAt(i, this.m4);
    this.glyphs.setMatrixAt(i, this.m5.multiplyMatrices(this.m4, under ? this.decBot : this.decTop));
    const f = this.makerIdx[i];
    if (f >= 0 && this.frames) {
      // (the frame pops up out of its tile, from the middle out, when the diamond lights)
      const d = Math.abs((i % N) - (N - 1) / 2) + Math.abs(Math.floor(i / N) - (N - 1) / 2);
      const u = this.makersK >= 1 ? 1 : clamp(this.makersK * 2.2 - d * 0.22, 0, 1);
      this.m6.compose(this.v.set(0, TH / 2 - (1 - u) * 0.08, 0), this.q.identity(), this.sc.setScalar(u < 1 ? Math.max(0.001, backOut(u)) : 1));
      this.sc.set(1, 1, 1);
      if (under) this.m6.premultiply(this.flipX);
      this.frames.setMatrixAt(f, this.m5.multiplyMatrices(this.m4, this.m6));
    }
  }

  /** Tile i's colours: who it shows, its checker, its glyph, a flash of white, dimmed in the tally. */
  private tileColor(i: number, flash: number) {
    if (!this.isTile[i]) return;
    const o = this.shown[i];
    const odd = ((i % N) + Math.floor(i / N)) % 2;
    const mk = this.makersOn && this.maker[i] === 1;
    const dim = (this.phase === "tally" || this.phase === "done") && !this.lit[i];
    if (o >= 0) this.col.copy(this.seatC[o][odd]);
    else this.col.copy(mk ? this.makersStone[odd] : this.blank[odd]);
    if (dim) this.col.lerp(DIM, o >= 0 ? 0.62 : 0.5);
    const wk = this.warnOf(i);
    if (wk > 0) this.col.lerp(this.warnC, wk);
    if (flash > 0) this.col.lerp(WHITE, flash);
    this.tiles.setColorAt(i, this.col);
    // the glyph: the owner's sigil glowing in its ink, or the stone's faint lattice, or the shielded mark
    const cell = o >= 0 ? o : mk ? CELL_MAKERS : CELL_BLANK;
    if (this.cellOf[i] !== cell) {
      this.cellOf[i] = cell;
      this.cells.setXY(i, (cell % 3) / 3, cell < 3 ? 0.5 : 0);
      this.cells.needsUpdate = true;
    }
    this.col.copy(o >= 0 ? this.glyphC[o] : mk ? GLYPH_MAKERS : this.glyphBlank);
    if (dim) this.col.multiplyScalar(0.22);
    if (flash > 0) this.col.lerp(WHITE, flash);
    this.glyphs.setColorAt(i, this.col);
  }

  /** A twist's warning on tile i (how much of this.warnC): a gate about to move, a wedge the wave will wash. */
  private warnOf(i: number) {
    if (this.phase !== "play") return 0;
    const pulse = 0.5 + 0.5 * Math.sin(this.clk * 17);
    const k = this.kind[i];
    if (this.gateWarn && (k === C_GATE_A || k === C_GATE_B)) {
      const up = this.gateUpNow(i);
      this.warnC = up ? WARN_OPEN : WARN_GATE;
      return up ? 0.15 + 0.3 * pulse : 0.3 + 0.6 * pulse;
    }
    if (this.waveWedge >= 0 && this.wedgeOf[i] === this.waveWedge) {
      this.warnC = WARN_WAVE;
      return 0.2 + 0.55 * pulse;
    }
    return 0;
  }

  private flushColors() {
    this.tiles.instanceColor!.needsUpdate = true;
    this.glyphs.instanceColor!.needsUpdate = true;
  }

  /** Tile t is inscribed for `seat` (a flip `kind` 1 after `delay`, turning round (ax, az)): its worth gained, 0 if it was already. */
  private inscribe(t: number, seat: number, kind: number, delay = 0, ax = 1, az = 0) {
    // (no tile there, or a risen gate: its ink is set in it)
    if (t < 0 || !this.isTile[t] || this.lift[t] > 0.15) return 0;
    const was = this.own[t];
    if (was === seat) return 0;
    if (was >= 0) {
      this.cnt[was]--;
      if (this.maker[t]) this.makerOwn[was]--;
    }
    this.own[t] = seat;
    this.cnt[seat]++;
    if (this.maker[t]) this.makerOwn[seat]++;
    this.flips[seat]++;
    this.startAnim(t, kind, delay, ax, az);
    return this.makersOn && this.maker[t] ? 2 : 1;
  }

  /** The wave washes tile t back to blank stone (a flip after `delay`). */
  private unscribe(t: number, delay: number, ax: number, az: number) {
    const was = this.own[t];
    if (was < 0) return;
    this.cnt[was]--;
    if (this.maker[t]) this.makerOwn[was]--;
    this.own[t] = -1;
    this.startAnim(t, 1, delay, ax, az);
  }

  private startAnim(t: number, kind: number, delay: number, ax: number, az: number) {
    this.animT[t] = -delay;
    this.animK[t] = kind;
    this.animAx[t] = ax;
    this.animAz[t] = az;
    if (!this.inAnim[t]) {
      this.inAnim[t] = 1;
      this.anim[this.animN++] = t;
    }
  }

  /** The flips and pops in progress (only those tiles are touched). */
  private animTiles(dt: number) {
    let any = false;
    for (let k = 0; k < this.animN; ) {
      const i = this.anim[k];
      this.animT[i] += dt;
      const tt = this.animT[i];
      const kind = this.animK[i];
      const dur = kind === 1 ? 0.42 : kind === 2 ? 0.3 : 0.26;
      if (tt < 0) {
        k++;
        continue;
      }
      any = true;
      if (tt >= dur) {
        this.shown[i] = this.own[i];
        this.placeTile(i, kind === 2 ? 0.06 : 0, 0);
        this.tileColor(i, 0);
        this.inAnim[i] = 0;
        this.anim[k] = this.anim[--this.animN];
        continue;
      }
      const u = tt / dur;
      if (kind === 1) {
        // a flip: up, over, down (the new face, its new glyph, once it has turned half way)
        const over = u >= 0.5;
        if (over) this.shown[i] = this.own[i];
        this.placeTile(i, Math.sin(Math.PI * u) * 0.75, Math.PI * ease(u), this.animAx[i], this.animAz[i], 1, over);
        this.tileColor(i, Math.sin(Math.PI * u) * 0.35);
      } else if (kind === 2) {
        // the tally's count: a hop to stand a little proud, bright
        this.placeTile(i, Math.sin(Math.PI * Math.min(1, u * 1.4)) * 0.45 + u * 0.06, 0);
        this.tileColor(i, (1 - u) * 0.6);
      } else {
        // run over: a squash and a spring, a flash
        this.shown[i] = this.own[i];
        const y = u < 0.3 ? -(u / 0.3) * 0.1 : Math.sin(((u - 0.3) / 0.7) * Math.PI) * 0.16;
        this.placeTile(i, y, Math.sin(u * Math.PI) * 0.12, this.animAx[i], this.animAz[i], 1 - Math.max(0, 0.3 - u) * 0.6);
        this.tileColor(i, (1 - u) * (1 - u) * 0.75);
      }
      k++;
    }
    if (any) {
      this.tiles.instanceMatrix.needsUpdate = true;
      this.glyphs.instanceMatrix.needsUpdate = true;
      if (this.makerN) this.frames.instanceMatrix.needsUpdate = true;
      this.flushColors();
    }
  }

  /** Stamp a round patch of `seat`'s sigil round (x, z): tiles within √r2 (in tiles) flip outward in a ripple. */
  private stamp(seat: number, x: number, z: number, r2: number) {
    const c = this.cellAt(x, z);
    const cx = c % N,
      cz = Math.floor(c / N);
    const R = Math.ceil(Math.sqrt(r2));
    let got = 0;
    for (let dz = -R; dz <= R; dz++)
      for (let dx = -R; dx <= R; dx++) {
        const d2 = dx * dx + dz * dz;
        if (d2 > r2) continue;
        const ix = cx + dx,
          iz = cz + dz;
        if (ix < 0 || iz < 0 || ix >= N || iz >= N) continue;
        const d = Math.sqrt(d2) || 1;
        // (turned over away from the middle: the axis across the way out)
        got += this.inscribe(iz * N + ix, seat, 1, Math.sqrt(d2) * 0.045, d2 ? -dz / d : 1, d2 ? dx / d : 0);
      }
    return got;
  }

  /** What tile t is worth to seat i (0: its own already). */
  private worth(i: number, t: number, lead: number) {
    if (t < 0 || !this.isTile[t] || this.lift[t] > 0.15) return 0;
    const o = this.own[t];
    if (o === i) return 0;
    let v = this.makersOn && this.maker[t] ? 2 : 1;
    // (a rival's: it costs them too; the leader's most, for a pro)
    if (o >= 0) v += 0.15 + (o === lead ? 0.35 * this.players[i].skill : 0);
    // (the wave is coming for it: hardly worth it)
    if (this.waveWedge >= 0 && this.wedgeOf[t] === this.waveWedge) v *= 0.15;
    return v;
  }

  private points(i: number) {
    return this.cnt[i] + (this.makersOn ? this.makerOwn[i] : 0);
  }

  private leader() {
    let b = 0;
    for (let i = 1; i < 4; i++) if (this.points(i) > this.points(b)) b = i;
    return b;
  }

  // ---- the frame ---------------------------------------------------------------------------------

  idle(dt: number, phase: "card" | "count", k: number) {
    dt = Math.max(0, dt);
    this.clk += dt;
    this.phase = phase;
    if (phase === "card") this.cardCam(k);
    else {
      // down from the fly-over onto the game's own camera
      if (!this.countFrom) this.countFrom = { eye: this.cam.eye.clone(), at: this.cam.at.clone() };
      this.playCam(this.eye, this.at);
      const e = ease(k);
      this.cam.eye.lerpVectors(this.countFrom.eye, this.eye, e);
      this.cam.at.lerpVectors(this.countFrom.at, this.at, e);
    }
    this.cam.apply(dt);
    for (const r of this.run) {
      // (a little hop now and then: ready, eager)
      if (r.a.grounded && Math.random() < dt * 0.35) r.a.jump(6);
      r.a.physics(dt, 0);
      r.a.sync(dt, this.clk);
    }
    this.decor(dt);
    this.animTiles(dt);
    this.fx.update(dt);
  }

  update(dt: number, input: Input) {
    // (the host's first frame can hand a hair below zero)
    dt = Math.max(0, Math.min(dt, 0.05));
    this.clk += dt;
    if (this.phase === "card" || this.phase === "count") this.phase = "play";
    this.pt += dt;
    if (this.phase === "play") {
      this.t = Math.min(TIME, this.t + dt);
      this.escalate();
      if (this.t >= TIME) this.timeUp();
    } else if (this.phase === "time" && this.pt >= TIME_HOLD) this.startTally();
    else if (this.phase === "tally") this.tally(dt);
    else if (this.phase === "done") {
      if (this.winT >= 0 && (this.winT += dt) > 0.35 && !this.done) this.done = this.order;
    }
    // the camera's flat forward: "up" runs that way
    this.w.camera.getWorldDirection(this.v);
    const fl = Math.hypot(this.v.x, this.v.z) || 1;
    this.fwx = this.v.x / fl;
    this.fwz = this.v.z / fl;
    if (this.spin) this.turnDeck(dt);
    const lead = this.leader();
    for (const r of this.run) this.control(r, dt, input, lead);
    this.move(dt);
    this.twists(dt);
    this.items(dt);
    this.flyShots(dt);
    for (const r of this.run) this.pose(r, dt);
    this.decor(dt);
    this.animTiles(dt);
    // (the announcer says one thing at a time)
    if (this.news.length && (this.news[0].t += dt) > this.news[0].d) this.news.shift();
    if (this.news.length > 3) this.news.splice(1, this.news.length - 3);
    for (let i = 0; i < 4; i++) this.bump[i] = Math.max(0, this.bump[i] - dt * 2.5);
    this.camFrame(dt);
    this.fx.update(dt);
    if (this.dbg) (window as unknown as { __turf: unknown }).__turf = { phase: this.phase, t: this.t, hint: this.hint(), pts: this.points(0) };
  }

  private escalate() {
    const t = this.t;
    if (!this.said.hurry && t >= HURRY_AT) {
      this.said.hurry = true;
      music.rate(1.15);
      this.say(T("HURRY!", "快！"), "#ff5a3c", 1.4, 70);
      [0, 0.12, 0.24].forEach((d) => beep(1046, 0.09, "square", 0.25, 0, d));
      // (sparks fly off the rim's lights all round)
      for (let k = 0; k < this.nBulbs; k += 5) {
        const lx = this.bulbPos[k * 2],
          lz = this.bulbPos[k * 2 + 1];
        this.fx.burst(this.v.set(lx * this.ca + lz * this.sa, 0.6, -lx * this.sa + lz * this.ca), 4, ["#ff5a3c", "#ffd27a", "#ffffff"], { speed: 3, up: 4, size: 0.18, life: 0.7 });
      }
    }
    if (!this.said.makers && t >= MAKERS_AT) {
      // SHIELDED HOUR: the lilac diamond in the middle counts double
      this.said.makers = true;
      this.makersOn = true;
      this.makersK = 0;
      this.frames.visible = true;
      this.say(T("SHIELDED HOUR!", "屏蔽时刻！"), LILAC, 1.5, 64);
      this.say(T("CENTRE TILES ×2", "中心地砖 ×2"), LILAC, 1.4, 54);
      sfx.star();
      for (let i = 0; i < NT; i++)
        if (this.maker[i]) {
          if (this.own[i] < 0) this.startAnim(i, 1, Math.hypot((i % N) - 7.5, Math.floor(i / N) - 7.5) * 0.08, 1, 0);
          if ((i * 7) % 3 === 0) this.fx.burst(this.wpos(i, 0.3), 3, [LILAC, "#ffffff", "#e6dcff"], { speed: 2, up: 5, size: 0.16, life: 0.9 });
        }
      this.cam.shake(0.15);
    }
    // the last five seconds tick
    const left = Math.ceil(TIME - t);
    if (left <= 5 && left !== this.said.five && left > 0) {
      this.said.five = left;
      beep(left === 1 ? 1320 : 990, 0.08, "square", 0.22);
    }
    // the gates shift (warned first), the waves come
    const gt = this.lv.gates;
    if (gt && this.gateNext < TIME - 0.5) {
      if (!this.gateWarn && t >= this.gateNext - gt.warn) this.warnGates();
      if (t >= this.gateNext) this.shiftGates();
    }
    const wv = this.lv.waves;
    if (wv && this.waveI < wv.at.length) {
      const at = wv.at[this.waveI];
      if (this.waveWedge < 0 && t >= at - wv.warn) this.warnWave();
      if (this.waveWedge >= 0 && t >= at) this.wash();
    }
    // the Z-Blocks
    if (t >= this.qbNext) {
      const hurry = t >= HURRY_AT;
      let on = 0;
      for (const q of this.qbs) if (q.st) on++;
      if (on < (hurry ? QB_MAX_HURRY : QB_MAX) && t < TIME - 2) this.dropQB();
      this.qbNext = t + (hurry ? QB_EVERY_HURRY : QB_EVERY) * (0.85 + this.rnd() * 0.3);
    }
  }

  private timeUp() {
    this.phase = "time";
    this.pt = 0;
    this.say(T("TIME!", "时间到！"), "#ffffff", TIME_HOLD + 0.2, 72);
    sfx.whoosh();
    // (a wave or a shift still to come is called off)
    if (this.gateWarn) this.gateWarn = false;
    if (this.waveWedge >= 0) {
      this.waveWedge = -1;
      if (this.waveMesh) this.waveMesh.visible = false;
    }
    for (let i = 0; i < NT; i++) if (!this.inAnim[i]) this.tileColor(i, 0);
    this.flushColors();
    // what is left in hand fizzles; the Z-Blocks pop away
    for (const r of this.run) {
      if (r.batches > 0) this.fx.burst(this.v.copy(r.a.pos).setY(2.3 * SIZE), 10, ["#bdb6cc", "#ffffff"], { speed: 2, up: 2, gravity: -1, size: 0.25, life: 0.7, drag: 2 });
      r.batches = 0;
      r.bigsig = r.rush = 0;
    }
    for (const q of this.qbs)
      if (q.st) {
        this.fx.burst(this.v.set(q.x, 0.9, q.z), 14, ["#ffcf2e", "#fff4c4"], { speed: 3, up: 3, size: 0.2, life: 0.7 });
        this.hideQB(q);
      }
  }

  // ---- the players -------------------------------------------------------------------------------

  private control(r: Run, dt: number, input: Input, lead: number) {
    const i = r.i;
    const playing = this.phase === "play";
    // (your shove charged again: a ding)
    if (r.cd > 0 && r.cd <= dt && r.p.human && playing) beep(1568, 0.06, "square", 0.18);
    r.cd = Math.max(0, r.cd - dt);
    r.dash = Math.max(0, r.dash - dt);
    r.rec = Math.max(0, r.rec - dt);
    r.immune = Math.max(0, r.immune - dt);
    r.revT = Math.max(0, r.revT - dt);
    r.angryT = Math.max(0, r.angryT - dt);
    r.dodge = Math.max(0, r.dodge - dt);
    r.idleT = Math.max(0, r.idleT - dt);
    r.bbuf -= dt;
    if (r.p.human && playing && input.pressed("b")) r.bbuf = BBUF;
    if (playing) {
      r.bigsig = Math.max(0, r.bigsig - dt);
      r.rush = Math.max(0, r.rush - dt);
    }
    if (r.stun > 0) {
      r.stun = Math.max(0, r.stun - dt);
      this.steer(r, 0, 0, dt, 6);
      return;
    }
    if (!playing) {
      this.steer(r, 0, 0, dt, 8);
      return;
    }
    if (r.batches > 0) {
      r.held += dt;
      // held too long, it goes by itself
      if (r.held >= BATCH_AUTO) this.throwBatch(i);
    }
    let mx = 0,
      mz = 0,
      sp = SPEED;
    if (r.p.human) {
      const ax = input.axis();
      mx = -this.fwz * ax.x + this.fwx * -ax.y;
      mz = this.fwx * ax.x + this.fwz * -ax.y;
      const m = Math.hypot(mx, mz);
      if (m > 0) ((mx /= m), (mz /= m), (r.dx = mx), (r.dz = mz));
      if (r.bbuf > 0 && r.cd <= 0) ((r.bbuf = 0), this.tryDash(i, r.dx, r.dz));
      if (input.pressed("a") && r.batches > 0) this.throwBatch(i);
    } else {
      if ((r.think -= dt) <= 0) this.think(r, lead);
      const s = r.p.skill;
      sp = SPEED * (0.8 + 0.2 * s);
      if (r.dodge > 0) ((mx = r.ddx), (mz = r.ddz));
      else if (r.idleT > 0) mx = mz = 0;
      else {
        let tx = r.tx,
          tz = r.tz;
        if (r.goal >= 0) {
          const q = this.qbs[r.goal];
          if (q.st) ((tx = q.x), (tz = q.z));
          else r.goal = -1;
        }
        // (through the walls: cell by cell along its way)
        if (this.lv.map && r.plen > 0 && this.waypoint(r)) ((tx = this.spot[0]), (tz = this.spot[1]));
        const ddx = tx - r.a.pos.x,
          ddz = tz - r.a.pos.z;
        const d = Math.hypot(ddx, ddz);
        if (d < 0.45) {
          r.think = 0;
          mx = mz = 0;
        } else {
          const c = Math.cos(r.wob),
            sn = Math.sin(r.wob);
          mx = (ddx / d) * c - (ddz / d) * sn;
          mz = (ddx / d) * sn + (ddz / d) * c;
        }
      }
      if (mx || mz) ((r.dx = mx), (r.dz = mz));
      // (stuck on a wall's corner: think again)
      if (this.lv.map && (mx || mz) && Math.hypot(r.vx, r.vz) < 1 && r.dash <= 0) {
        if ((r.stuck += dt) > 0.45) ((r.stuck = 0), (r.think = 0), (r.plen = 0), (r.wob = (this.rnd() - 0.5) * 1.6));
      } else r.stuck = 0;
    }
    if (r.rush > 0) sp *= RUSH_K;
    if (r.rec > 0) sp *= 0.45;
    if (r.dash > 0) {
      r.vx = r.dx * DASH_V;
      r.vz = r.dz * DASH_V;
      return;
    }
    this.steer(r, mx * sp, mz * sp, dt, ACC);
  }

  private steer(r: Run, wx: number, wz: number, dt: number, k: number) {
    const f = 1 - Math.exp(-k * dt);
    r.vx += (wx - r.vx) * f;
    r.vz += (wz - r.vz) * f;
  }

  private tryDash(i: number, dx: number, dz: number) {
    const r = this.run[i];
    if (r.cd > 0 || r.stun > 0 || this.phase !== "play") return;
    const m = Math.hypot(dx, dz) || 1;
    r.dx = dx / m;
    r.dz = dz / m;
    r.dash = DASH_T;
    r.cd = DASH_CD;
    r.rec = DASH_T + DASH_REC;
    this.stats.shoves++;
    this.fx.burst(this.v.set(r.a.pos.x - r.dx * 0.5, 0.2, r.a.pos.z - r.dz * 0.5), 8, ["#ffffff", r.p.color], { speed: 2.5, up: 1.5, gravity: 6, size: 0.22, life: 0.45 });
    if (r.p.human) sfx.whoosh();
    // those near see it coming (a pro in a blink, in time to sidestep)
    for (const o of this.run) {
      if (o === r || o.p.human) continue;
      const ox = o.a.pos.x - r.a.pos.x,
        oz = o.a.pos.z - r.a.pos.z;
      const d = Math.hypot(ox, oz);
      if (d < 3.6 && (ox * r.dx + oz * r.dz) / (d || 1) > 0.75 && this.rnd() < o.p.skill * 0.55) {
        const side = -r.dz * ox + r.dx * oz > 0 ? 1 : -1;
        o.dodge = 0.28;
        o.ddx = -r.dz * side;
        o.ddz = r.dx * side;
      }
    }
  }

  /** All move: velocities, knocks, the rim, bumping into each other, the shoves that land, the ink. */
  private move(dt: number) {
    for (const r of this.run) {
      const p = r.a.pos;
      const kd = Math.exp(-5.5 * dt);
      r.kx *= kd;
      r.kz *= kd;
      p.x += (r.vx + r.kx) * dt;
      p.z += (r.vz + r.kz) * dt;
    }
    // bumping into each other (a shove's hit first)
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) {
        if (i === j) continue;
        const a = this.run[i],
          b = this.run[j];
        const dx = b.a.pos.x - a.a.pos.x,
          dz = b.a.pos.z - a.a.pos.z;
        const d = Math.hypot(dx, dz);
        if (a.dash > 0 && d < PR * 2 + 0.5 && dx * a.dx + dz * a.dz > -0.1 && b.immune <= 0 && this.phase === "play") this.shoveHit(i, j);
        if (j > i && d < PR * 2 && d > 1e-4) {
          const lap = (PR * 2 - d) / 2;
          a.a.pos.x -= (dx / d) * lap;
          a.a.pos.z -= (dz / d) * lap;
          b.a.pos.x += (dx / d) * lap;
          b.a.pos.z += (dz / d) * lap;
        }
      }
    // the walls and the rim have the last word (a bump never leaves anyone in a wall or past the edge)
    let held = 0;
    for (const r of this.run) if (this.hold(r)) held |= 1 << r.i;
    // (one a wall just pushed back doesn't give way twice: whoever leans on it is the one moved back)
    if (held)
      for (let i = 0; i < 4; i++)
        for (let j = i + 1; j < 4; j++) {
          const hi = (held >> i) & 1,
            hj = (held >> j) & 1;
          if (hi === hj) continue;
          const a = this.run[hi ? j : i],
            w = this.run[hi ? i : j];
          const dx = a.a.pos.x - w.a.pos.x,
            dz = a.a.pos.z - w.a.pos.z;
          const d = Math.hypot(dx, dz);
          if (d >= PR * 2 || d < 1e-4) continue;
          a.a.pos.x += (dx / d) * (PR * 2 - d);
          a.a.pos.z += (dz / d) * (PR * 2 - d);
          this.hold(a);
        }
    // the ink under the feet
    if (this.phase !== "play") return;
    for (const r of this.run) {
      if (r.stun > 0 || r.a.pos.y > 0.5) continue;
      const p = r.a.pos;
      let got = 0;
      let at = -1;
      if (r.bigsig > 0) {
        // the BIG PROOF: a 3-wide stripe under its drum
        const c = this.cellAt(p.x + r.dx * 1.0, p.z + r.dz * 1.0);
        if (c >= 0) {
          const cx = c % N,
            cz = Math.floor(c / N);
          for (let dz = -1; dz <= 1; dz++)
            for (let dx = -1; dx <= 1; dx++) {
              const ix = cx + dx,
                iz = cz + dz;
              if (ix < 0 || iz < 0 || ix >= N || iz >= N) continue;
              const t = iz * N + ix;
              const g = this.inscribe(t, r.i, 0, 0, r.dz, -r.dx);
              if (g) {
                got += g;
                at = t;
                if (this.rnd() < 0.4) this.fx.burst(this.wpos(t, 0.15), 1, [r.p.color], { speed: 1.5, up: 2.5, size: 0.16, life: 0.4 });
              }
            }
        }
      } else {
        const t = this.tileAt(p.x, p.z);
        got = this.inscribe(t, r.i, 0, 0, r.dz, -r.dx);
        if (got) {
          at = t;
          this.fx.burst(this.wpos(t, 0.12), 2, [r.p.color, r.p.color, "#ffffff"], { speed: 1.4, up: 2.6, size: 0.15, life: 0.42 });
        }
      }
      if (got && r.p.human) {
        r.comboT = 0.45;
        if (this.clk - this.plipAt > 0.055) {
          this.plipAt = this.clk;
          const n = SCALE[r.combo % SCALE.length];
          r.combo++;
          beep(523 * Math.pow(2, n / 12), 0.07, "triangle", this.maker[at] && this.makersOn ? 0.3 : 0.2);
        }
      }
      if ((r.comboT -= dt) <= 0) r.combo = 0;
    }
  }

  /** The walls and the rim hold r in (a hard knock bounces off them). True when they moved it. */
  private hold(r: Run) {
    const p = r.a.pos;
    const lim = HALF - PR;
    const x0 = p.x,
      z0 = p.z;
    if (this.lv.map) this.walls(r);
    if (this.lv.round) {
      // the round rim holds everyone in (a hard knock bounces off it)
      const R = this.rimIn - PR,
        d = Math.hypot(p.x, p.z);
      if (d > R) {
        const nx = p.x / d,
          nz = p.z / d;
        p.x = nx * R;
        p.z = nz * R;
        const kv = r.kx * nx + r.kz * nz;
        if (kv > 3.5) {
          r.kx -= 1.45 * kv * nx;
          r.kz -= 1.45 * kv * nz;
          this.fx.burst(this.v.set(nx * (R + 0.4), 0.6, nz * (R + 0.4)), 8, ["#ffffff", FLARE], { speed: 3, up: 2, size: 0.18, life: 0.5 });
          sfx.thud();
          this.cam.shake(0.12);
        } else if (kv > 0) ((r.kx -= kv * nx), (r.kz -= kv * nz));
        const vv = r.vx * nx + r.vz * nz;
        if (vv > 0) ((r.vx -= vv * nx * 0.7), (r.vz -= vv * nz * 0.7));
      }
      return p.x !== x0 || p.z !== z0;
    }
    // the rim holds everyone in (a hard knock bounces off it)
    for (let ax = 0; ax < 2; ax++) {
      const v = ax ? p.z : p.x;
      if (Math.abs(v) <= lim) continue;
      const sgn = Math.sign(v);
      if (ax) p.z = sgn * lim;
      else p.x = sgn * lim;
      // (only what goes outward: a knock or a run back in is left alone)
      const kv = (ax ? r.kz : r.kx) * sgn;
      if (kv > 3.5) {
        if (ax) r.kz = -sgn * kv * 0.45;
        else r.kx = -sgn * kv * 0.45;
        this.fx.burst(this.v.set(p.x + (ax ? 0 : sgn * 0.4), 0.6, p.z + (ax ? sgn * 0.4 : 0)), 8, ["#ffffff", FLARE], { speed: 3, up: 2, size: 0.18, life: 0.5 });
        sfx.thud();
        this.cam.shake(0.12);
      } else if (kv > 0) {
        if (ax) r.kz = 0;
        else r.kx = 0;
      }
      if ((ax ? r.vz : r.vx) * sgn > 0) {
        if (ax) r.vz *= 0.3;
        else r.vx *= 0.3;
      }
    }
    return p.x !== x0 || p.z !== z0;
  }

  private shoveHit(i: number, j: number) {
    const a = this.run[i],
      b = this.run[j];
    let nx = b.a.pos.x - a.a.pos.x,
      nz = b.a.pos.z - a.a.pos.z;
    const d = Math.hypot(nx, nz) || 1;
    // (mostly where the shove went, a little away from the shover)
    nx = nx / d + a.dx * 1.4;
    nz = nz / d + a.dz * 1.4;
    const m = Math.hypot(nx, nz) || 1;
    nx /= m;
    nz /= m;
    this.stats.hits++;
    b.kx = nx * KNOCK * (b.p.human ? 0.85 : 1);
    b.kz = nz * KNOCK * (b.p.human ? 0.85 : 1);
    b.vx = b.vz = 0;
    b.stun = DIZZY;
    b.immune = DIZZY + IMMUNE;
    b.dash = 0;
    b.spin = (this.rnd() < 0.5 ? -1 : 1) * 13;
    b.a.vy = 5.5;
    b.a.grounded = false;
    b.a.hit();
    a.dash = 0;
    a.vx *= 0.15;
    a.vz *= 0.15;
    a.rec = 0.18;
    // the shover's sigil stamped round where the victim stood
    const got = this.stamp(i, b.a.pos.x, b.a.pos.z, STAMP_R2);
    this.bump[i] = 1;
    const at = this.v.copy(b.a.pos).setY(1.1 * SIZE);
    this.fx.burst(at, 34, [a.p.color, a.p.color, "#ffffff", LILAC], { speed: 7, up: 4, size: 0.2, life: 0.75 });
    this.pow(at.x, at.y + 0.3, at.z, 2.2, a.p.color);
    this.popText(j, T("STAMPED!", "盖章！"), a.p.color, true);
    if (got >= 4) this.popText(i, `+${got}`, "#ffffff", false);
    const near = a.p.human || b.p.human;
    this.cam.shake(near ? 0.4 : 0.16);
    sfx.hit();
    splat(near ? 0.5 : 0.28);
    if (b.p.human) sfx.lose();
    else {
      b.angryT = 2;
      if (this.rnd() < 0.3 + b.p.skill * 0.5) ((b.rev = i), (b.revT = 5));
      b.think = Math.max(b.think, DIZZY);
    }
  }

  // ---- the walls (the graveyard) ----------------------------------------------------------------

  /** Keep r out of the walls and the risen gates round it (a hard knock bounces off them). */
  private walls(r: Run) {
    const p = r.a.pos;
    const cx = Math.floor((p.x + HALF) / TS),
      cz = Math.floor((p.z + HALF) / TS);
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const ix = cx + dx,
          iz = cz + dz;
        if (ix < 0 || iz < 0 || ix >= N || iz >= N) continue;
        const c = iz * N + ix;
        if (!this.solid(c)) continue;
        const x0 = ix * TS - HALF,
          z0 = iz * TS - HALF;
        const qx = clamp(p.x, x0, x0 + TS),
          qz = clamp(p.z, z0, z0 + TS);
        let nx = p.x - qx,
          nz = p.z - qz;
        const d2 = nx * nx + nz * nz;
        if (d2 >= PR * PR) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          nx /= d;
          nz /= d;
          p.x += nx * (PR - d);
          p.z += nz * (PR - d);
        } else {
          // (inside it: out by the nearest face)
          const l = p.x - x0,
            rr2 = x0 + TS - p.x,
            t = p.z - z0,
            b = z0 + TS - p.z;
          const m = Math.min(l, rr2, t, b);
          nx = m === l ? -1 : m === rr2 ? 1 : 0;
          nz = nx ? 0 : m === t ? -1 : 1;
          if (nx) p.x = nx < 0 ? x0 - PR : x0 + TS + PR;
          else p.z = nz < 0 ? z0 - PR : z0 + TS + PR;
        }
        const kv = r.kx * nx + r.kz * nz;
        if (kv < -3.5) {
          r.kx -= 1.45 * kv * nx;
          r.kz -= 1.45 * kv * nz;
          this.fx.burst(this.v.set(p.x - nx * PR, 0.7, p.z - nz * PR), 8, ["#ffffff", "#9d98b8"], { speed: 3, up: 2, size: 0.18, life: 0.5 });
          sfx.thud();
          this.cam.shake(0.1);
        } else if (kv < 0) ((r.kx -= kv * nx), (r.kz -= kv * nz));
        const vv = r.vx * nx + r.vz * nz;
        if (vv < 0) ((r.vx -= vv * nx), (r.vz -= vv * nz));
        if (r.dash > 0 && r.dx * nx + r.dz * nz < -0.6) r.dash = 0;
      }
  }

  /** Nothing in the way from (x0, z0) to (x1, z1), a body wide? */
  private los(x0: number, z0: number, x1: number, z1: number) {
    const L = Math.hypot(x1 - x0, z1 - z0);
    if (L < 1e-3) return true;
    const n = Math.ceil(L / 0.3);
    const ox = (-(z1 - z0) / L) * 0.36,
      oz = ((x1 - x0) / L) * 0.36;
    for (let k = 1; k <= n; k++) {
      const x = x0 + ((x1 - x0) * k) / n,
        z = z0 + ((z1 - z0) * k) / n;
      if (this.solid(this.cellAt(x, z)) || this.solid(this.cellAt(x + ox, z + oz)) || this.solid(this.cellAt(x - ox, z - oz))) return false;
    }
    return true;
  }

  /** Every cell's steps from `from` (the walls and the gates about to move in the way): this.dist, this.prev. */
  private bfs(from: number, ahead = true) {
    this.dist.fill(-1);
    let h = 0,
      t = 0;
    this.queue[t++] = from;
    this.dist[from] = 0;
    this.prev[from] = -1;
    while (h < t) {
      const c = this.queue[h++];
      const ix = c % N,
        d = this.dist[c] + 1;
      for (let k = 0; k < 4; k++) {
        const nc = k === 0 ? (ix > 0 ? c - 1 : -1) : k === 1 ? (ix < N - 1 ? c + 1 : -1) : k === 2 ? c - N : c + N;
        if (nc < 0 || nc >= NT || this.dist[nc] >= 0 || this.solid(nc, ahead)) continue;
        this.dist[nc] = d;
        this.prev[nc] = c;
        this.queue[t++] = nc;
      }
    }
  }

  /** The worth of the way to cell c (after bfs), per metre: the tiles on it, the patch round its end. */
  private pathStretch(i: number, c: number, lead: number, wide: boolean) {
    const steps = this.dist[c];
    if (steps <= 0) return -1;
    const L = steps * TS;
    let v = 0;
    for (let k = c; k >= 0 && this.dist[k] > 0; k = this.prev[k]) v += this.worth(i, k, lead) * (wide ? 2.4 : 1);
    const cx = c % N,
      cz = Math.floor(c / N);
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const ix = cx + dx,
          iz = cz + dz;
        if (ix >= 0 && iz >= 0 && ix < N && iz < N) v += this.worth(i, iz * N + ix, lead) * 0.3;
      }
    const x = tileX(c),
      z = tileZ(c);
    for (const o of this.run) {
      if (o.i === i) continue;
      if (Math.hypot(o.a.pos.x - x, o.a.pos.z - z) < L * 0.6) v *= 0.78;
    }
    return v / (L + 2.4);
  }

  /** r's way to cell c (after bfs). */
  private setPath(r: Run, c: number) {
    let n = 0;
    for (let k = c; k >= 0 && n < NT; k = this.prev[k]) {
      this.tmpPath[n++] = k;
      if (this.dist[k] === 0) break;
    }
    const len = Math.min(n, r.path.length);
    for (let j = 0; j < len; j++) r.path[j] = this.tmpPath[n - 1 - j];
    r.plen = len;
    r.pk = Math.min(1, len - 1);
  }

  /** The next spot on r's way (into this.spot): false once on the last cell (go for the exact spot). */
  private waypoint(r: Run) {
    const p = r.a.pos;
    while (r.pk < r.plen - 1) {
      const c = r.path[r.pk];
      if (Math.hypot(tileX(c) - p.x, tileZ(c) - p.z) < 0.5) r.pk++;
      else break;
    }
    // (a cell further on in plain sight: straight there)
    for (let k = Math.min(r.plen - 1, r.pk + 3); k > r.pk; k--) {
      const c = r.path[k];
      if (this.los(p.x, p.z, tileX(c), tileZ(c))) {
        r.pk = k;
        break;
      }
    }
    if (r.pk >= r.plen - 1) return false;
    const c = r.path[r.pk];
    this.spot[0] = tileX(c);
    this.spot[1] = tileZ(c);
    return true;
  }

  // ---- the twists --------------------------------------------------------------------------------

  /** The deck turns (the pier): everything on it is carried round. */
  private turnDeck(dt: number) {
    this.spinK = this.phase === "play" ? Math.min(1, this.spinK + dt * 0.8) : Math.max(0, this.spinK - dt * 0.9);
    const da = this.spin * this.spinK * dt;
    if (!da) return;
    this.ang += da;
    this.ca = Math.cos(this.ang);
    this.sa = Math.sin(this.ang);
    this.deck.rotation.y = this.ang;
    const c = Math.cos(da),
      sn = Math.sin(da);
    let x = 0;
    for (const r of this.run) {
      const p = r.a.pos;
      x = p.x;
      p.x = x * c + p.z * sn;
      p.z = -x * sn + p.z * c;
      x = r.tx;
      r.tx = x * c + r.tz * sn;
      r.tz = -x * sn + r.tz * c;
      x = r.dx;
      r.dx = x * c + r.dz * sn;
      r.dz = -x * sn + r.dz * c;
      r.a.yaw += da;
    }
    for (const q of this.qbs) {
      if (!q.st) continue;
      x = q.x;
      q.x = x * c + q.z * sn;
      q.z = -x * sn + q.z * c;
    }
    for (const sh of this.shots) {
      if (!sh.on) continue;
      x = sh.tx;
      sh.tx = x * c + sh.tz * sn;
      sh.tz = -x * sn + sh.tz * c;
      x = sh.fx;
      sh.fx = x * c + sh.fz * sn;
      sh.fz = -x * sn + sh.fz * c;
    }
  }

  /** The gates rise and sink, the warned tiles throb, the wave rolls. */
  private twists(dt: number) {
    const g = this.lv.gates;
    if (g) {
      let moved = false;
      for (const c of this.gateCells) {
        let target = this.gateUpNow(c) ? g.h : 0;
        // (about to rise: it shudders in its slot)
        if (this.gateWarn && this.phase === "play" && !this.gateUpNow(c)) target = 0.08 + Math.sin(this.clk * 45 + c) * 0.05;
        const l = this.lift[c];
        if (l === target) continue;
        const step = (g.h / 0.3) * dt;
        this.lift[c] = Math.abs(target - l) <= step ? target : l + Math.sign(target - l) * step;
        moved = true;
        if (!this.inAnim[c]) this.placeTile(c, 0, 0);
      }
      if (moved) {
        this.placeGates();
        this.tiles.instanceMatrix.needsUpdate = true;
        this.glyphs.instanceMatrix.needsUpdate = true;
      }
      if (this.gateWarn) {
        for (const c of this.gateCells) if (!this.inAnim[c]) this.tileColor(c, 0);
        this.flushColors();
        // (grit shaken off the gates about to rise)
        if ((this.warnFx -= dt) <= 0) {
          this.warnFx = 0.05;
          const c = this.gateCells[Math.floor(Math.random() * this.gateCells.length)];
          if (!this.gateUpNow(c)) this.fx.burst(this.wpos(c, 0.15), 2, ["#ff6b6b", "#ffffff", "#9d98b8"], { speed: 1.6, up: 2.5, size: 0.13, life: 0.45 });
        }
      }
    }
    const wv = this.lv.waves;
    if (wv && this.waveMesh) {
      if (this.waveMark && this.waveMarkMat) {
        const on = this.waveWedge >= 0 && this.phase === "play";
        this.waveMark.visible = on;
        if (on) {
          // (its rotation: the wedge's start; the stripes crawl in, faster as it nears)
          this.waveMark.rotation.z = (this.waveWedge / wv.wedges) * Math.PI * 2;
          this.waveMarkMat.opacity = 0.32 + 0.3 * (0.5 + 0.5 * Math.sin(this.clk * 12));
          this.waveMarkMat.map!.offset.x = (this.clk * 1.2) % 1;
        }
      }
      if (this.waveWedge >= 0) {
        for (let i = 0; i < NT; i++) if (this.wedgeOf[i] === this.waveWedge && !this.inAnim[i]) this.tileColor(i, 0);
        this.flushColors();
        // the swell rises over the rim, spray off its crest
        const k = clamp(1 - (wv.at[this.waveI] - this.t) / wv.warn, 0, 1);
        this.placeWave(this.waveWedge, this.rimOut + 0.9, 0.4 + 1.9 * ease(k), k);
        if ((this.warnFx -= dt) <= 0) {
          this.warnFx = 0.04;
          const a = -Math.PI + ((this.waveWedge + Math.random()) / wv.wedges) * Math.PI * 2;
          const r = this.rimOut + 0.9;
          const lx = Math.cos(a) * r,
            lz = Math.sin(a) * r;
          this.v.set(lx * this.ca + lz * this.sa, -0.2 + 2.2 * ease(k), -lx * this.sa + lz * this.ca);
          this.fx.burst(this.v, 2, ["#ffffff", "#bdf0ff", "#5fe0ff"], { speed: 1.8, up: 3, size: 0.16, life: 0.6 });
        }
      } else if (this.sweepW >= 0) {
        this.sweepT += dt;
        const u = this.sweepT / 0.55;
        const hubR = wv.hub * TS;
        if (u < 1) this.placeWave(this.sweepW, this.rimOut + 0.9 + (hubR - this.rimOut - 0.9) * u, 2.3 - u * 0.6, 1);
        else if (u < 1.6) this.placeWave(this.sweepW, hubR, 1.7 * (1 - (u - 1) / 0.6), 1);
        else {
          this.sweepW = -1;
          this.waveMesh.visible = false;
        }
      }
    }
  }

  /** The wave's voxels along wedge w at radius r (local), h high. */
  private placeWave(w: number, r: number, h: number, k: number) {
    const m = this.waveMesh!;
    m.visible = true;
    const n = this.lv.waves!.wedges;
    const a0 = -Math.PI + (w / n) * Math.PI * 2;
    const span = (Math.PI * 2) / n;
    const segW = ((r * span) / 16) * 1.12;
    for (let j = 0; j < 16; j++) {
      const a = a0 + ((j + 0.5) / 16) * span;
      const bob = Math.sin(this.clk * 7 + j * 0.9) * 0.18 * k;
      const hh = Math.max(0.05, h * (0.82 + 0.18 * Math.sin(j * 1.7 + this.clk * 3)) + bob);
      this.q.setFromAxisAngle(this.UP, -Math.PI / 2 - a);
      const x = Math.cos(a) * r,
        z = Math.sin(a) * r;
      this.m4.compose(this.v.set(x, -0.4 + hh / 2, z), this.q, this.sc.set(segW, hh, 0.9));
      m.setMatrixAt(j, this.m4);
      this.m4.compose(this.v.set(x - Math.cos(a) * 0.15, -0.4 + hh + 0.12, z - Math.sin(a) * 0.15), this.q, this.sc.set(segW * 1.02, 0.32, 0.75));
      m.setMatrixAt(16 + j, this.m4);
    }
    this.sc.set(1, 1, 1);
    m.instanceMatrix.needsUpdate = true;
  }

  private warnGates() {
    this.gateWarn = true;
    if (this.gateMove++ === 0) this.say(T("GATES SHIFT!", "闸门变换！"), "#ff4a5a", 1.3, 60);
    beep(98, 0.7, "sawtooth", 0.16, 0.8);
    beep(147, 0.5, "square", 0.08, 0.9, 0.12);
    // (the rivals think again: their ways may close)
    for (const r of this.run) if (!r.p.human) r.think = Math.min(r.think, 0.1 + (1 - r.p.skill) * 0.5);
  }

  private shiftGates() {
    const g = this.lv.gates!;
    this.gateWarn = false;
    this.gateUp ^= 1;
    this.gateNext += g.every;
    sfx.thud();
    splat(0.3);
    this.cam.shake(0.18);
    for (const c of this.gateCells) {
      if (!this.inAnim[c]) this.tileColor(c, 0);
      if (this.gateUpNow(c)) this.fx.burst(this.wpos(c, 0.3), 5, ["#9d98b8", "#ffffff", "#5f8f5a"], { speed: 2.5, up: 3, size: 0.2, life: 0.6 });
    }
    this.flushColors();
    // whoever stands on a gate that rises is bumped off it
    for (const r of this.run) {
      const c = this.cellAt(r.a.pos.x, r.a.pos.z);
      if ((this.kind[c] === C_GATE_A || this.kind[c] === C_GATE_B) && this.gateUpNow(c)) this.eject(r, c);
    }
    for (const r of this.run) {
      r.plen = 0;
      if (!r.p.human) r.think = Math.min(r.think, 0.05 + (1 - r.p.skill) * 0.35);
    }
  }

  /** r is bumped off gate c as it rises: to the open side nearest, with a hop. */
  private eject(r: Run, c: number) {
    const p = r.a.pos;
    const ix = c % N,
      iz = Math.floor(c / N);
    let best = -1,
      bd = 1e9;
    for (let k = 0; k < 4; k++) {
      const jx = ix + (k === 0 ? -1 : k === 1 ? 1 : 0),
        jz = iz + (k === 2 ? -1 : k === 3 ? 1 : 0);
      if (jx < 0 || jz < 0 || jx >= N || jz >= N) continue;
      const nc = jz * N + jx;
      if (this.kind[nc] === C_WALL || ((this.kind[nc] === C_GATE_A || this.kind[nc] === C_GATE_B) && this.gateUpNow(nc))) continue;
      const d = Math.hypot(tileX(nc) - p.x, tileZ(nc) - p.z);
      if (d < bd) ((bd = d), (best = k));
    }
    if (best < 0) return;
    const sx = best === 0 ? -1 : best === 1 ? 1 : 0,
      sz = best === 2 ? -1 : best === 3 ? 1 : 0;
    if (sx) p.x = tileX(c) + sx * (TS / 2 + PR + 0.03);
    if (sz) p.z = tileZ(c) + sz * (TS / 2 + PR + 0.03);
    r.kx = sx * 3.5;
    r.kz = sz * 3.5;
    r.a.vy = 5;
    r.a.grounded = false;
    r.plen = 0;
    this.fx.burst(this.v.copy(p).setY(0.4), 10, ["#ffffff", "#9d98b8"], { speed: 3, up: 3, size: 0.2, life: 0.5 });
    if (r.p.human) sfx.hit();
  }

  private warnWave() {
    const wv = this.lv.waves!;
    // the sea takes the fullest wedge (never the same one twice running)
    const ink = [0, 0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < NT; i++) if (this.wedgeOf[i] >= 0 && this.own[i] >= 0) ink[this.wedgeOf[i]]++;
    let w = 0,
      best = -1;
    for (let k = 0; k < wv.wedges; k++) {
      if (k === this.lastWedge) continue;
      const v = ink[k] + this.rnd() * 6;
      if (v > best) ((best = v), (w = k));
    }
    this.waveWedge = this.lastWedge = w;
    this.say(this.waveI === 0 ? T("HIGH TIDE!", "涨潮了！") : T("WAVE!", "海浪！"), "#5fe0ff", 1.3, this.waveI === 0 ? 62 : 56);
    beep(130, 0.9, "sawtooth", 0.15, 0.85);
    beep(196, 0.7, "triangle", 0.12, 0.8, 0.2);
  }

  /** The wave washes its wedge back to blank, from the rim in, and pushes whoever stands there. */
  private wash() {
    const wv = this.lv.waves!;
    const w = this.waveWedge;
    this.waveWedge = -1;
    this.waveI++;
    this.sweepW = w;
    this.sweepT = 0;
    const outer = this.rimOut;
    for (let i = 0; i < NT; i++) {
      if (this.wedgeOf[i] !== w) continue;
      const lx = tileX(i),
        lz = tileZ(i);
      const d = Math.hypot(lx, lz) || 1;
      if (this.own[i] >= 0) this.unscribe(i, ((outer - d) / (outer - wv.hub * TS)) * 0.5, -lz / d, lx / d);
      else if (!this.inAnim[i]) this.tileColor(i, 0);
      if ((i * 5) % 4 === 0) this.fx.burst(this.wpos(i, 0.2), 2, ["#9ff3ff", "#ffffff", "#33c4e4"], { speed: 2, up: 4, size: 0.2, life: 0.7 });
    }
    this.flushColors();
    // those in the wedge are pushed toward the hub
    const n = wv.wedges;
    let near = false;
    for (const r of this.run) {
      const p = r.a.pos;
      const lx = p.x * this.ca - p.z * this.sa,
        lz = p.x * this.sa + p.z * this.ca;
      const d = Math.hypot(lx, lz);
      if (d < wv.hub * TS) continue;
      const a = Math.atan2(lz, lx);
      if (Math.floor(((a + Math.PI) / (Math.PI * 2)) * n) % n !== w) continue;
      r.kx = (-p.x / d) * 7;
      r.kz = (-p.z / d) * 7;
      r.a.vy = 5.5;
      r.a.grounded = false;
      r.a.hit();
      this.popText(r.i, T("SPLASH!", "哗啦！"), "#9ff3ff", true);
      if (r.p.human) near = true;
    }
    this.cam.shake(near ? 0.4 : 0.22);
    splat(near ? 0.7 : 0.45);
    sfx.whoosh();
  }

  // ---- items -------------------------------------------------------------------------------------

  private dropQB() {
    const q = this.qbs.find((x) => !x.st);
    if (!q) return;
    // a spot well away from everyone (the best of a few tries; not too far from all either)
    let bx = 0,
      bz = 0,
      best = -1;
    for (let k = 0; k < 10; k++) {
      const ix = 2 + Math.floor(this.rnd() * (N - 4)),
        iz = 2 + Math.floor(this.rnd() * (N - 4));
      // (on a plain tile: not on a wall, a gate or the plate)
      const c = iz * N + ix;
      if (this.kind[c] !== C_TILE) continue;
      this.wpos(c, 0);
      const x = this.v.x,
        z = this.v.z;
      let md = 99;
      for (const r of this.run) md = Math.min(md, Math.hypot(r.a.pos.x - x, r.a.pos.z - z));
      for (const o of this.qbs) if (o.st) md = Math.min(md, Math.hypot(o.x - x, o.z - z) * 0.8);
      const sc = Math.min(md, 6.5) + this.rnd() * 1.5;
      if (sc > best) ((best = sc), (bx = x), (bz = z));
    }
    if (best < 0) return;
    const u = this.rnd();
    q.kind = u < 0.42 ? BATCH : u < 0.75 ? BIGSIG : RUSH;
    q.x = bx;
    q.z = bz;
    q.t0 = this.t;
    q.st = 1;
    q.sq = 0;
    q.m.visible = q.shadow.visible = q.ring.visible = true;
    q.icon.visible = false;
    q.icon.material = this.iconMats[q.kind];
    beep(880, 0.12, "sine", 0.16, 1.6);
  }

  private hideQB(q: QB) {
    q.st = 0;
    q.m.visible = q.shadow.visible = q.ring.visible = q.icon.visible = false;
  }

  private items(dt: number) {
    for (const q of this.qbs) {
      if (!q.st) continue;
      const age = this.t - q.t0;
      if (q.st === 1) {
        const k = clamp(age / QB_WARN, 0, 1);
        // its shadow grows and its ring pulses where it will land; it falls in from high up
        q.m.position.set(q.x, 0.8 + (1 - k) * (1 - k) * 17, q.z);
        q.m.rotation.y += dt * 4;
        q.shadow.position.set(q.x, 0.04, q.z);
        q.shadow.scale.setScalar(0.4 + k * 1.1);
        q.ring.position.set(q.x, 0.05, q.z);
        q.ring.scale.setScalar(2.4 - k * 0.8 + Math.sin(this.clk * 14) * 0.08);
        if (k >= 1) {
          q.st = 2;
          q.sq = 1;
          q.icon.visible = true;
          this.fx.burst(this.v.set(q.x, 0.2, q.z), 12, ["#ffffff", "#ffe8a0"], { speed: 3.5, up: 1.5, gravity: 4, size: 0.24, life: 0.6 });
          sfx.thud();
          this.cam.shake(0.08);
        }
      } else {
        // down: it hovers, spins and bobs, its item over it; it blinks before it goes
        q.sq = Math.max(0, q.sq - dt * 4);
        const bob = Math.sin(this.clk * 3 + q.x) * 0.1;
        q.m.position.set(q.x, 0.8 + bob, q.z);
        q.m.rotation.y += dt * 1.6;
        q.m.scale.set(0.95 * (1 + q.sq * 0.25), 0.95 * (1 - q.sq * 0.3), 0.95 * (1 + q.sq * 0.25));
        q.icon.position.set(q.x, 2.05 + bob * 1.4, q.z);
        q.shadow.scale.setScalar(1.5);
        q.ring.scale.setScalar(1.6 + Math.sin(this.clk * 5) * 0.06);
        const left = QB_LIFE - (age - QB_WARN);
        const blink = left < 2 && Math.floor(this.clk * 10) % 2 === 0;
        q.m.visible = q.icon.visible = !blink;
        if (left <= 0) {
          this.fx.burst(this.v.set(q.x, 0.9, q.z), 10, ["#ffcf2e", "#ffffff"], { speed: 2, up: 2, size: 0.2, life: 0.6 });
          this.hideQB(q);
          continue;
        }
      }
      // grabbed (as it lands or once down)
      if (this.phase !== "play" || age < QB_WARN * 0.9) continue;
      for (const r of this.run) {
        if (r.stun > 0) continue;
        if (Math.hypot(r.a.pos.x - q.x, r.a.pos.z - q.z) < PR + 0.75) {
          this.give(r, q.kind);
          this.fx.burst(this.v.set(q.x, 1, q.z), 26, ["#ffcf2e", "#fff4c4", ITEM_C[q.kind]], { speed: 5, up: 5, size: 0.22, life: 0.8 });
          this.hideQB(q);
          break;
        }
      }
    }
    // the AIs' goals on a Z-Block gone
    for (const r of this.run) if (r.goal >= 0 && !this.qbs[r.goal].st) r.goal = -1;
  }

  private give(r: Run, kind: number) {
    this.stats.items++;
    if (kind === BATCH) {
      r.batches = Math.min(2, r.batches + 1);
      r.held = 0;
      this.popText(r.i, r.p.human ? T("BATCH! · A", "批量！· A") : T("BATCH!", "批量！"), ITEM_C[kind], true);
    } else if (kind === BIGSIG) {
      r.bigsig = BIGSIG_T;
      this.popText(r.i, T("BIG PROOF!", "大证明！"), ITEM_C[kind], true);
    } else {
      r.rush = RUSH_T;
      this.popText(r.i, T("HASH RUSH!", "算力冲刺！"), ITEM_C[kind], true);
    }
    if (r.p.human) sfx.star();
    else sfx.coin();
  }

  private throwBatch(i: number) {
    const r = this.run[i];
    const s = this.shots.find((x) => !x.on);
    if (!s || r.batches <= 0) return;
    r.batches--;
    r.held = 0;
    this.stats.batches++;
    s.on = true;
    s.seat = i;
    s.t = 0;
    s.fx = r.a.pos.x;
    s.fy = 2.2 * SIZE;
    s.fz = r.a.pos.z;
    const [tx, tz] = this.batchSpot(r);
    s.tx = tx;
    s.tz = tz;
    s.band.material = toon(r.p.color);
    s.mark.material = glow(r.p.color, 0.75, true);
    s.g.visible = s.mark.visible = true;
    s.mark.position.set(tx, 0.06, tz);
    s.mark.scale.setScalar(Math.sqrt(BATCH_R2) * TS * 2 + 0.4);
    sfx.whoosh();
    beep(660, 0.25, "triangle", 0.18, 0.5);
  }

  /** Where a BATCH thrown now would land: ahead, inside the board. */
  private batchSpot(r: Run, out = this.spot) {
    return this.inside(r.a.pos.x + r.dx * BATCH_RANGE, r.a.pos.z + r.dz * BATCH_RANGE, 0.7, out);
  }

  /** A spot pulled inside the board (`m` from its edge): the square's, or the round deck's. */
  private inside(x: number, z: number, m: number, out = this.spot) {
    if (this.lv.round) {
      const R = (this.lv.round + 0.5) * TS - m,
        d = Math.hypot(x, z);
      const k = d > R ? R / d : 1;
      out[0] = x * k;
      out[1] = z * k;
    } else {
      out[0] = clamp(x, -HALF + m, HALF - m);
      out[1] = clamp(z, -HALF + m, HALF - m);
    }
    return out;
  }

  private flyShots(dt: number) {
    for (const s of this.shots) {
      if (!s.on) continue;
      s.t += dt;
      const k = Math.min(1, s.t / BATCH_FLY);
      const x = s.fx + (s.tx - s.fx) * k,
        z = s.fz + (s.tz - s.fz) * k;
      const y = s.fy * (1 - k) + 0.3 * k + Math.sin(Math.PI * k) * 3.2;
      s.g.position.set(x, y, z);
      s.g.rotation.set(s.t * 9, 0, s.t * 6);
      s.mark.scale.setScalar((Math.sqrt(BATCH_R2) * TS * 2 + 0.4) * (1 + Math.sin(this.clk * 20) * 0.04));
      s.mark.position.set(s.tx, 0.06, s.tz);
      if (k >= 1) {
        s.on = false;
        s.g.visible = s.mark.visible = false;
        this.blast(s.seat, s.tx, s.tz);
      }
    }
  }

  private blast(seat: number, x: number, z: number) {
    const p = this.players[seat];
    const got = this.phase === "play" || this.phase === "time" ? this.stamp(seat, x, z, BATCH_R2) : 0;
    this.bump[seat] = 1;
    this.fx.burst(this.v.set(x, 0.4, z), 60, [p.color, p.color, "#ffffff", LILAC], { speed: 9, up: 7, size: 0.24, life: 0.9 });
    this.pow(x, 1.2, z, 4, p.color);
    if (got > 0) this.popText(seat, `+${got}`, "#ffffff", true);
    // those caught near are knocked aside (no dizzy spell: it only inscribes)
    let near = p.human;
    for (const r of this.run) {
      if (r.i === seat) continue;
      const dx = r.a.pos.x - x,
        dz = r.a.pos.z - z;
      const d = Math.hypot(dx, dz);
      if (d < 2.2) {
        r.kx += (dx / (d || 1)) * 6;
        r.kz += (dz / (d || 1)) * 6;
        r.a.vy = 4;
        r.a.grounded = false;
        r.a.hit();
        if (r.p.human) near = true;
      }
    }
    this.cam.shake(near ? 0.45 : 0.22);
    sfx.thud();
    splat(near ? 0.6 : 0.35);
  }

  // ---- the AI ------------------------------------------------------------------------------------

  /** What a BATCH landing at (x, z) would inscribe for seat i. */
  private blastValue(i: number, x: number, z: number, lead: number) {
    const sp = this.inside(x, z, 0.7, this.spot2);
    const c = this.cellAt(sp[0], sp[1]);
    const cx = c % N,
      cz = Math.floor(c / N);
    let v = 0;
    for (let dz = -2; dz <= 2; dz++)
      for (let dx = -2; dx <= 2; dx++) {
        if (dx * dx + dz * dz > BATCH_R2) continue;
        const ix = cx + dx,
          iz = cz + dz;
        if (ix >= 0 && iz >= 0 && ix < N && iz < N) v += this.worth(i, iz * N + ix, lead);
      }
    return v;
  }

  /** The worth of a run from (px, pz) to (x, z), per metre: the tiles on the way, the patch round its end. */
  private stretch(i: number, px: number, pz: number, x: number, z: number, lead: number, wide: boolean) {
    const L = Math.hypot(x - px, z - pz);
    if (L < 0.8) return -1;
    const n = Math.ceil(L / (TS * 0.6));
    let v = 0,
      last = -1;
    for (let k = 1; k <= n; k++) {
      const t = this.tileAt(px + ((x - px) * k) / n, pz + ((z - pz) * k) / n);
      if (t !== last) ((v += this.worth(i, t, lead) * (wide ? 2.4 : 1)), (last = t));
    }
    const c = this.tileAt(x, z);
    if (c >= 0) {
      const cx = c % N,
        cz = Math.floor(c / N);
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          const ix = cx + dx,
            iz = cz + dz;
          if (ix >= 0 && iz >= 0 && ix < N && iz < N) v += this.worth(i, iz * N + ix, lead) * 0.3;
        }
    }
    // (somebody else nearer to it: it will be theirs before I get there)
    for (const o of this.run) {
      if (o.i === i) continue;
      if (Math.hypot(o.a.pos.x - x, o.a.pos.z - z) < L * 0.6) v *= 0.78;
    }
    return v / (L + 2.4);
  }

  private think(r: Run, lead: number) {
    const i = r.i,
      s = r.p.skill,
      rnd = this.rnd;
    r.think = 0.14 + (1 - s) * 0.42 + rnd() * 0.12;
    const px = r.a.pos.x,
      pz = r.a.pos.z;
    r.wob = (rnd() - 0.5) * (1 - s) * 0.75;
    // (walls: every way is searched from here first)
    const maze = !!this.lv.map;
    if (maze) {
      // (a pro sees the gates about to move; a tourist finds out when they do)
      this.bfs(this.cellAt(px, pz), rnd() < 0.25 + s * 0.75);
      // (a little less wobble in the lanes)
      r.wob *= 0.6;
    }
    // 1) a BATCH in hand: the best of eight throws (a tourist throws it where it faces, when it feels like it)
    if (r.batches > 0) {
      let best = -1,
        bx = r.dx,
        bz = r.dz;
      const tries = s > 0.45 ? 8 : 1;
      for (let k = 0; k < tries; k++) {
        const a = tries === 1 ? Math.atan2(r.dx, r.dz) : (k / 8) * Math.PI * 2 + rnd() * 0.3;
        const dx = Math.sin(a),
          dz = Math.cos(a);
        const v = this.blastValue(i, px + dx * BATCH_RANGE, pz + dz * BATCH_RANGE, lead);
        if (v > best) ((best = v), (bx = dx), (bz = dz));
      }
      if (best >= 9 + s * 7 || r.held > 1.6 + (1 - s) * 2.5 + rnd()) {
        r.dx = bx;
        r.dz = bz;
        this.throwBatch(i);
        return;
      }
    }
    // 2) a rival close: shove it (a pro more often, the leader first; a grudge too)
    if (r.cd <= 0 && this.t > 1.2) {
      let tgt = -1,
        bd = 2.5 + s * 0.7;
      for (const o of this.run) {
        if (o.i === i || o.stun > 0 || o.immune > 0.15) continue;
        const d = Math.hypot(o.a.pos.x - px, o.a.pos.z - pz);
        if (d < bd && (!maze || this.los(px, pz, o.a.pos.x, o.a.pos.z))) ((bd = d), (tgt = o.i));
      }
      if (tgt >= 0) {
        const o = this.run[tgt];
        let p = 0.06 + 0.42 * s;
        if (tgt === lead) p *= 1 + s * 0.8;
        if (o.p.human) p *= 0.5 + 0.5 * s;
        if (tgt === r.rev && r.revT > 0) p += 0.3;
        if (rnd() < p) {
          const lead2 = 0.1 + s * 0.1;
          let ax = o.a.pos.x + o.vx * lead2 - px,
            az = o.a.pos.z + o.vz * lead2 - pz;
          const err = (rnd() - 0.5) * (1 - s) * 0.9;
          const c = Math.cos(err),
            sn = Math.sin(err);
          [ax, az] = [ax * c - az * sn, ax * sn + az * c];
          this.tryDash(i, ax, az);
          r.think = 0.25;
          return;
        }
      }
    }
    // a tourist sometimes just stands and looks round
    if (rnd() < (1 - s) * 0.06) {
      r.idleT = 0.25 + rnd() * 0.4;
      return;
    }
    // 3) a Z-Block near enough (coming down or down): go for it, if nobody is much closer
    if (r.goal < 0 || !this.qbs[r.goal].st) {
      r.goal = -1;
      let bd = 3.5 + s * 7;
      this.qbs.forEach((q, k) => {
        if (!q.st) return;
        let d = Math.hypot(q.x - px, q.z - pz);
        if (maze) {
          const st = this.dist[this.cellAt(q.x, q.z)];
          if (st < 0) return;
          d = Math.max(d, st * TS);
        }
        let closer = false;
        for (const o of this.run) if (o.i !== i && Math.hypot(q.x - o.a.pos.x, q.z - o.a.pos.z) < d * 0.6) closer = true;
        if (d < bd && !closer && rnd() < 0.45 + s * 0.45) ((bd = d), (r.goal = k));
      });
      if (r.goal >= 0) {
        if (maze) this.setPath(r, this.cellAt(this.qbs[r.goal].x, this.qbs[r.goal].z));
        return;
      }
    } else if (maze) {
      // (on its way to a Z-Block: the way again, from here)
      const q = this.qbs[r.goal];
      if (this.dist[this.cellAt(q.x, q.z)] > 0) this.setPath(r, this.cellAt(q.x, q.z));
      else r.goal = -1;
    }
    // 4) the best stretch to inscribe: on from here in eight ways, a few spots anywhere, the plan it has
    // (through walls: the way there, cell by cell)
    const wide = r.bigsig > 0;
    let bc = maze ? this.cellAt(r.tx, r.tz) : -1;
    let best = (maze ? this.pathStretch(i, bc, lead, wide) : this.stretch(i, px, pz, r.tx, r.tz, lead, wide)) * 1.12,
      bx = r.tx,
      bz = r.tz;
    const noise = (1 - s) * 1.1;
    const pick = (x: number, z: number) => {
      const sp = this.inside(x, z, 0.6, this.spot2);
      x = sp[0];
      z = sp[1];
      if (maze) {
        const c = this.cellAt(x, z);
        if (this.dist[c] <= 0) return;
        const sc = this.pathStretch(i, c, lead, wide) * (1 + (rnd() - 0.5) * noise);
        if (sc > best) ((best = sc), (bx = tileX(c)), (bz = tileZ(c)), (bc = c));
        return;
      }
      const sc = this.stretch(i, px, pz, x, z, lead, wide) * (1 + (rnd() - 0.5) * noise);
      if (sc > best) ((best = sc), (bx = x), (bz = z));
    };
    const a0 = rnd() * Math.PI * 2;
    for (let k = 0; k < 8; k++) {
      const a = a0 + (k / 8) * Math.PI * 2;
      pick(px + Math.sin(a) * 3.6, pz + Math.cos(a) * 3.6);
      pick(px + Math.sin(a) * 7.5, pz + Math.cos(a) * 7.5);
    }
    const nr = 3 + Math.round(s * 6);
    for (let k = 0; k < nr; k++) pick((rnd() * 2 - 1) * HALF, (rnd() * 2 - 1) * HALF);
    // (in Shielded Hour a pro makes for the lilac)
    if (this.makersOn && rnd() < 0.2 + s * 0.5) pick((rnd() - 0.5) * this.lv.makersR * 2, (rnd() - 0.5) * this.lv.makersR * 2);
    r.tx = bx;
    r.tz = bz;
    if (maze && r.goal < 0) {
      if (bc >= 0 && this.dist[bc] > 0) this.setPath(r, bc);
      else r.plen = 0;
      // (a tourist loses its way now and then: straight at it, into a wall maybe)
      if (rnd() < (1 - s) * 0.32) r.plen = 0;
    }
  }

  /** The bench's scripted human: what a sensible player would press now (screen arrows, A, B). */
  hint() {
    const h = this.human;
    if (h < 0 || this.phase !== "play") return null;
    const r = this.run[h],
      lead = this.leader();
    const px = r.a.pos.x,
      pz = r.a.pos.z;
    const maze = !!this.lv.map;
    let a = false,
      b = false;
    if (r.batches > 0) {
      const [x, z] = this.batchSpot(r);
      if (this.blastValue(h, x, z, lead) >= 11 || r.held > 3) a = true;
    }
    let tgt = -1;
    for (const o of this.run) if (o.i !== h && o.stun <= 0 && o.immune <= 0 && Math.hypot(o.a.pos.x - px, o.a.pos.z - pz) < 2.4 && (!maze || this.los(px, pz, o.a.pos.x, o.a.pos.z))) tgt = o.i;
    let tx = r.tx,
      tz = r.tz;
    if (tgt >= 0 && r.cd <= 0) {
      b = true;
      tx = this.run[tgt].a.pos.x;
      tz = this.run[tgt].a.pos.z;
    } else {
      let qd = 7,
        qc = -1;
      for (const q of this.qbs) if (q.st && Math.hypot(q.x - px, q.z - pz) < qd) ((qd = Math.hypot(q.x - px, q.z - pz)), (tx = q.x), (tz = q.z), (qc = this.cellAt(q.x, q.z)));
      // (re-plan when there, or now and then; in the graveyard also when its way is gone)
      const replan = (qd >= 7 || maze) && (Math.hypot(r.tx - px, r.tz - pz) < 0.6 || (r.think -= 1 / 30) <= 0 || (maze && r.plen === 0));
      if (maze && replan) this.bfs(this.cellAt(px, pz));
      if (qd < 7) {
        if (maze && replan && this.dist[qc] > 0) this.setPath(r, qc);
      } else {
        if (replan) {
          r.think = 0.35;
          let best = -1,
            bc = -1;
          for (let k = 0; k < 16; k++) {
            const an = (k / 16) * Math.PI * 2;
            for (const d of [3.6, 7.5]) {
              const sp = this.inside(px + Math.sin(an) * d, pz + Math.cos(an) * d, 0.6, this.spot2);
              const x = sp[0],
                z = sp[1];
              if (maze) {
                const c = this.cellAt(x, z);
                if (this.dist[c] <= 0) continue;
                const sc = this.pathStretch(h, c, lead, r.bigsig > 0);
                if (sc > best) ((best = sc), (r.tx = tileX(c)), (r.tz = tileZ(c)), (bc = c));
                continue;
              }
              const sc = this.stretch(h, px, pz, x, z, lead, r.bigsig > 0);
              if (sc > best) ((best = sc), (r.tx = x), (r.tz = z));
            }
          }
          if (maze && bc >= 0) this.setPath(r, bc);
        }
        tx = r.tx;
        tz = r.tz;
      }
      if (maze && r.plen > 0 && this.waypoint(r)) ((tx = this.spot[0]), (tz = this.spot[1]));
    }
    const wx = tx - px,
      wz = tz - pz;
    const l = Math.hypot(wx, wz) || 1;
    // the world way → the screen's arrows (right, down)
    const sx = (-this.fwz * wx + this.fwx * wz) / l,
      sy = -(this.fwx * wx + this.fwz * wz) / l;
    return { x: sx, y: sy, a, b, pts: this.points(h) };
  }

  // ---- the end -----------------------------------------------------------------------------------

  private startTally() {
    this.phase = "tally";
    this.pt = 0;
    // each colour counts from round its own snark outward
    for (let s = 0; s < 4; s++) {
      const p = this.run[s].a.pos;
      const list: number[] = [];
      for (let t = 0; t < NT; t++) if (this.own[t] === s) list.push(t);
      // (where the deck has turned to)
      const lx = p.x * this.ca - p.z * this.sa,
        lz = p.x * this.sa + p.z * this.ca;
      list.sort((a, b) => Math.hypot(tileX(a) - lx, tileZ(a) - lz) - Math.hypot(tileX(b) - lx, tileZ(b) - lz));
      this.tallyList[s] = Int16Array.from(list);
      this.pts[s] = this.points(s);
    }
    this.tallyMax = Math.max(1, ...this.pts);
    this.lit.fill(0);
    for (let i = 0; i < NT; i++) this.tileColor(i, 0);
    this.flushColors();
    sfx.tick();
  }

  private tally(dt: number) {
    const u = clamp(this.pt / TALLY_T, 0, 1);
    // (fast, then slower as it climbs: the last tiles of the top two count out slow)
    const n = Math.ceil(this.tallyMax * (1 - Math.pow(1 - u, 2.2)) - 1e-6);
    let up = false;
    for (let s = 0; s < 4; s++) {
      const list = this.tallyList[s];
      while (this.tallyPtr[s] < list.length) {
        const t = list[this.tallyPtr[s]];
        const v = this.maker[t] ? 2 : 1;
        if (this.tallyPts[s] + v > n && this.tallyPts[s] + 1 > n) break;
        this.tallyPts[s] = Math.min(this.pts[s], this.tallyPts[s] + v);
        this.tallyPtr[s]++;
        this.lit[t] = 1;
        this.startAnim(t, 2, 0, 1, 0);
        up = true;
      }
      if (!this.finished[s] && this.tallyPtr[s] >= list.length && (n >= this.pts[s] || u >= 1)) {
        this.finished[s] = true;
        this.tallyPts[s] = this.pts[s];
        this.bump[s] = 1;
        if (n < this.tallyMax) {
          beep(392, 0.16, "square", 0.22);
          // (out of the count: the lowest sulks)
          let lower = 0;
          for (let k = 0; k < 4; k++) if (this.pts[k] < this.pts[s]) lower++;
          if (lower === 0) this.run[s].angryT = 3;
        }
      }
    }
    if (up && (this.tallyTick -= dt) <= 0) {
      this.tallyTick = 0.04;
      beep(330 + n * 7, 0.045, "square", 0.14);
    }
    if (u >= 1 && !this.order) {
      for (let s = 0; s < 4; s++) this.tallyPts[s] = this.pts[s];
      this.order = rankBy(this.pts, this.flips);
      this.phase = "done";
      this.winT = 0;
      const w = this.run[this.order[0]];
      w.a.cheer(3.5);
      w.a.jump(9);
      this.bump[w.i] = 1;
      this.fx.burst(this.v.copy(w.a.pos).setY(2.4), 90, [w.p.color, "#ffffff", LILAC, w.p.color], { speed: 9, up: 10, size: 0.22, life: 1.6, gravity: 9 });
      this.say(w.p.human ? T("YOU WIN!", "你赢了！") : T(`${short(w.p)} WINS!`, `${short(w.p)} 获胜！`), w.p.color, 3, 62);
      sfx.star();
      this.cam.shake(0.25);
      // the last one is cross
      this.run[this.order[3]].angryT = 4;
    }
  }

  // ---- the look ----------------------------------------------------------------------------------

  private pose(r: Run, dt: number) {
    const a = r.a,
      b = a.body;
    // a knock's hop; a dizzy spin
    if (r.stun > 0) {
      r.spin *= Math.exp(-2.2 * dt);
      a.yaw += r.spin * dt;
    } else if (this.phase === "tally" || this.phase === "done" || this.phase === "time") {
      // the count: everyone turns to the camera
      if (this.pt > 0.3 || this.phase !== "time") a.face(0, dt, 5);
    } else if (Math.hypot(r.vx, r.vz) > 0.4) a.face(yawOf(r.vx, r.vz), dt, r.dash > 0 ? 30 : 14);
    else if (r.p.human) a.face(yawOf(r.dx, r.dz), dt, 10);
    a.physics(dt, 0);
    a.sync(dt, this.clk);
    // the winner keeps jumping
    if (this.phase === "done" && this.order && r.i === this.order[0] && a.grounded && Math.random() < dt * 2.5) a.jump(8);
    // the gear: the roller pushed ahead, the BATCH over the head, the rush's ring
    const rolling = r.bigsig > 0 && r.stun <= 0;
    r.rollerG.visible = rolling;
    const holding = r.batches > 0;
    r.batchG.visible = holding;
    b.holdArms(rolling || holding);
    if (holding) {
      const bob = Math.sin(this.clk * 12 + r.i) * 0.08;
      b.armR.rotation.set(-2.9 + bob, 0, -0.25);
      b.armL.rotation.set(-2.9 - bob, 0, 0.25);
      b.foreArmR.rotation.set(-0.5, 0, 0);
      b.foreArmL.rotation.set(-0.5, 0, 0);
      const spark = r.batchG.userData.spark as THREE.Mesh;
      spark.scale.setScalar(0.12 + Math.random() * 0.1);
      // (throbbing when it is about to go by itself)
      const late = r.held > BATCH_AUTO - 1.5;
      r.batchG.scale.setScalar(late && Math.floor(this.clk * 12) % 2 ? 1.12 : 1);
      if (a.marker) a.marker.visible = false;
    } else if (rolling) {
      b.armR.rotation.set(-1.25, 0, 0.2);
      b.armL.rotation.set(-1.25, 0, -0.2);
      b.foreArmR.rotation.set(-0.35, 0, 0);
      b.foreArmL.rotation.set(-0.35, 0, 0);
      // (a drip of ink off it now and then)
      if (Math.random() < dt * 14) this.fx.burst(this.v.set(a.pos.x + r.dx * 1.05, 0.3, a.pos.z + r.dz * 1.05), 1, [r.p.color], { speed: 1.5, up: 1.5, size: 0.14, life: 0.35 });
    }
    r.rushRing.visible = r.rush > 0;
    if (r.rush > 0) {
      r.rushRing.position.set(a.pos.x, 0.06, a.pos.z);
      r.rushRing.rotation.z = this.clk * 6;
      r.rushRing.scale.setScalar(2 + Math.sin(this.clk * 18) * 0.12);
      if (Math.random() < dt * 25 && Math.hypot(r.vx, r.vz) > 2) this.fx.burst(this.v.set(a.pos.x - r.dx * 0.5, 0.5 + Math.random() * 0.8, a.pos.z - r.dz * 0.5), 1, [GLACIER, "#ffffff"], { speed: 0.5, up: 0.5, gravity: 0, size: 0.16, life: 0.3 });
    }
    // the faces
    if (r.stun > 0) b.puppet.motion.expr = 7;
    a.angry = r.angryT > 0;
    // the shove's streak
    if (r.dash > 0 && Math.random() < 0.8) this.fx.burst(this.v.set(a.pos.x, 0.8 + Math.random() * 0.6, a.pos.z), 1, [r.p.color, "#ffffff"], { speed: 0.3, up: 0.2, gravity: 0, size: 0.24, life: 0.22 });
  }

  /** The props that move by themselves: flags, decor, lights, the dizzy stars, the splats, the aim. */
  private decor(dt: number) {
    const now = this.clk;
    for (const q of this.deco) {
      if (q.userData.y === undefined) {
        // (the core under the board turns slowly)
        q.rotation.y = now * 0.5;
        continue;
      }
      q.rotation.y = now * 0.8 + q.userData.a;
      q.position.y = q.userData.y + Math.sin(now * 1.5 + q.userData.a) * 0.35;
    }
    if (this.sculpt) {
      this.sculpt.position.y = 3.4 + Math.sin(now * 1.1) * 0.3;
      this.sculpt.rotation.y = 0.75 + Math.sin(now * 0.5) * 0.25;
    }
    this.scenery?.tick(dt, now);
    this.dress?.(dt, now);
    for (const f of this.flags) {
      f.rotation.y = Math.sin(now * 3 + f.userData.x) * 0.3;
      f.position.x = f.userData.x - f.userData.sx * 0.5 * Math.cos(f.rotation.y);
    }
    if (this.cloudMesh) this.cloudMesh.rotation.y = now * 0.004;
    // the rim's chase lights: lilac in Shielded Hour, red in the last five seconds
    const lastFive = this.phase === "play" && TIME - this.t <= 5;
    const makers = this.makersOn && this.phase === "play";
    const pal = this.lv.bulbs;
    const wave = this.waveWedge;
    for (let k = 0; k < this.nBulbs; k++) {
      const ph = (k + Math.floor(now * 12)) % 5;
      // (the pier: the lights of the wedge the wave will wash flash cyan)
      if (wave >= 0 && this.bulbWedge && this.bulbWedge[k] === wave) this.col.set(Math.floor(now * 10) % 2 === k % 2 ? "#5fe0ff" : "#ffffff");
      else if (this.gateWarn && this.phase === "play") this.col.set(Math.floor(now * 10) % 2 === k % 2 ? "#ff4a5a" : pal[ph]);
      else if (lastFive) this.col.set(Math.floor(now * 8) % 2 === k % 2 ? "#ff3030" : "#ffffff");
      else if (makers) this.col.set(ph < 2 ? LILAC : ph === 2 ? "#ffffff" : "#8a6cff");
      else this.col.set(pal[ph]);
      this.bulbs.setColorAt(k, this.col);
    }
    this.bulbs.instanceColor!.needsUpdate = true;
    // the shielded frames rise in, then a glint runs across them
    if (this.makersOn) {
      if (this.makersK < 1) {
        this.makersK = Math.min(1, this.makersK + dt / 1.1);
        for (let i = 0; i < NT; i++) if (this.maker[i] && !this.inAnim[i]) this.placeTile(i, 0, 0);
        this.frames.instanceMatrix.needsUpdate = true;
        this.glyphs.instanceMatrix.needsUpdate = true;
        this.tiles.instanceMatrix.needsUpdate = true;
      }
      for (let i = 0; i < NT; i++) {
        const f = this.makerIdx[i];
        if (f < 0) continue;
        const d = (i % N) + Math.floor(i / N);
        const g = Math.max(0, Math.sin(now * 4 - d * 0.5));
        this.frames.setColorAt(f, this.col.setScalar(0.85 + g * g * 0.5));
      }
      this.frames.instanceColor!.needsUpdate = true;
    }
    // the dizzy stars round a stunned head
    let n = 0;
    for (const r of this.run) {
      if (r.stun <= 0) continue;
      for (let k = 0; k < 3; k++) {
        const an = now * 6 + (k / 3) * Math.PI * 2;
        this.q.setFromAxisAngle(this.UP, -an + Math.PI / 2);
        this.m4.compose(this.v.set(r.a.pos.x + Math.cos(an) * 0.5, r.a.pos.y + 2.05 * SIZE + Math.sin(an * 2) * 0.06, r.a.pos.z + Math.sin(an) * 0.5), this.q, this.sc.set(1.3, 1.3, 1.3));
        this.dizzy.setMatrixAt(n++, this.m4);
      }
    }
    this.sc.set(1, 1, 1);
    this.dizzy.count = n;
    this.dizzy.instanceMatrix.needsUpdate = true;
    // the splats
    for (const p of this.pows) {
      if (!p.m.visible) continue;
      p.t += dt;
      const k = p.t / 0.4;
      if (k >= 1) {
        p.m.visible = false;
        continue;
      }
      p.m.quaternion.copy(this.w.camera.quaternion);
      p.m.rotateZ(p.t * 2);
      p.m.scale.setScalar(p.s * (0.35 + Math.min(1, k * 4) * 0.65));
      p.mat.opacity = k > 0.6 ? (1 - k) / 0.4 : 1;
    }
    // your BATCH's aim
    const h = this.human >= 0 ? this.run[this.human] : null;
    const aiming = !!h && h.batches > 0 && this.phase === "play";
    this.aim.visible = this.aimFill.visible = aiming;
    if (aiming && h) {
      const [x, z] = this.batchSpot(h);
      const R = Math.sqrt(BATCH_R2) * TS * 2 + 0.4;
      this.aim.position.set(x, 0.07, z);
      this.aimFill.position.set(x, 0.06, z);
      this.aim.scale.setScalar(R * (1 + Math.sin(now * 10) * 0.04));
      this.aimFill.scale.setScalar(R * 0.82);
    }
  }

  private pow(x: number, y: number, z: number, s: number, c: string) {
    let p = this.pows[0];
    for (const q of this.pows) if (q.t > p.t) p = q;
    p.t = 0;
    p.s = s;
    p.mat.color.set(c);
    p.m.position.set(x, y, z);
    p.m.visible = true;
  }

  private popText(seat: number, s: string, c: string, big: boolean) {
    this.pops.push({ seat, s, c, t: this.clk, big });
    if (this.pops.length > 8) this.pops.shift();
  }

  private say(s: string, c: string, d: number, size = 58) {
    this.news.push({ s, c, t: 0, d, size });
  }

  // ---- the camera --------------------------------------------------------------------------------

  /** The play camera: high and three-quarter on the whole board, drifting a little after you. */
  private playCam(eye: THREE.Vector3, at: THREE.Vector3) {
    let fx = 0,
      fz = 0;
    if (this.human >= 0) {
      const p = this.run[this.human].a.pos;
      fx = p.x;
      fz = p.z;
    } else {
      for (const r of this.run) ((fx += r.a.pos.x / 4), (fz += r.a.pos.z / 4));
    }
    at.set(fx * 0.1, 0, fz * 0.08 + 1.2);
    const D = 26.5,
      P = 1.06;
    eye.set(at.x, at.y + D * Math.sin(P), at.z + D * Math.cos(P));
  }

  private camFrame(dt: number) {
    if (this.phase === "tally" || this.phase === "time") {
      // the count: up a little, the whole board square on
      this.at.set(0, 0, 0.9);
      const D = 27.5,
        P = 1.12;
      this.eye.set(0, D * Math.sin(P), 0.9 + D * Math.cos(P));
      this.cam.to(this.eye, this.at, dt, 1.6);
    } else if (this.phase === "done" && this.order) {
      // the winner: closer in on them
      const p = this.run[this.order[0]].a.pos;
      this.at.set(p.x * 0.55, 1.0, p.z * 0.55 + 0.5);
      const D = 17,
        P = 0.92;
      this.eye.set(this.at.x, this.at.y + D * Math.sin(P), this.at.z + D * Math.cos(P));
      this.cam.to(this.eye, this.at, dt, 2.2);
    } else {
      this.playCam(this.eye, this.at);
      this.cam.to(this.eye, this.at, dt, 2.5);
    }
    this.cam.apply(dt);
  }

  private cardCam(k: number) {
    this.cam.orbit(this.v.set(0, -1, 0), 0.55 + k * 0.3, 27, 13);
  }

  view() {
    return this.w;
  }

  // ---- the HUD -----------------------------------------------------------------------------------

  draw(g: CanvasRenderingContext2D) {
    if (this.phase === "card") return;
    const cam = this.w.camera;
    const counting = this.phase === "tally" || this.phase === "done";
    const lx = this.lx,
      ly = this.ly,
      lon = this.lon;
    for (const r of this.run) {
      const s = toScreen(r.a.head(this.v), cam);
      lx[r.i] = s.x;
      ly[r.i] = s.y;
      lon[r.i] = s.on;
      if (s.on && !counting) tag(g, r.p, s.x, s.y - 4);
    }
    if (counting) {
      // (huddled together at the bell: the counts make room for each other)
      for (let it = 0; it < 4; it++)
        for (let i = 0; i < 4; i++)
          for (let j = i + 1; j < 4; j++) {
            const dx = lx[j] - lx[i];
            if (Math.abs(dx) >= 58 || Math.abs(ly[j] - ly[i]) >= 40) continue;
            const push = (58 - Math.abs(dx)) / 2,
              sg = dx > 0 || (dx === 0 && j > i) ? 1 : -1;
            lx[i] -= sg * push;
            lx[j] += sg * push;
          }
      for (const r of this.run) {
        if (!lon[r.i]) continue;
        // the count over each head, bouncing as it climbs
        const k = 1 + this.bump[r.i] * 0.35;
        const win = this.phase === "done" && this.order && this.order[0] === r.i;
        shout(g, String(this.tallyPts[r.i]), lx[r.i], ly[r.i] - 8, (win ? 40 : 30) * k, this.finished[r.i] && !win ? "#ffffff" : r.p.color);
        if (this.phase === "done" && this.order) text(g, ord(this.order.indexOf(r.i)), lx[r.i], ly[r.i] + 16, 13, "#ffffff", "center", 900);
      }
    }
    // the floating words over the heads
    for (let k = this.pops.length - 1; k >= 0; k--) {
      const p = this.pops[k];
      const u = (this.clk - p.t) / 1.0;
      if (u >= 1) {
        this.pops.splice(k, 1);
        continue;
      }
      const s = toScreen(this.run[p.seat].a.head(this.v), cam);
      const sc = backOut(Math.min(1, u * 4));
      g.globalAlpha = u > 0.65 ? (1 - u) / 0.35 : 1;
      shout(g, p.s, s.x, s.y - 38 - u * 34, (p.big ? 22 : 18) * sc, p.c);
      g.globalAlpha = 1;
    }
    this.panels(g);
    if (!counting) clock(g, TIME - this.t);
    this.shareBar(g, counting);
    // Shielded Hour, as long as it lasts: a lilac chip under the bar
    if (this.makersOn && this.phase === "play") {
      const pulse = 0.85 + Math.sin(this.clk * 6) * 0.15;
      rr(g, W / 2 - 104, 86, 208, 22, 11);
      g.fillStyle = `rgba(196,177,252,${0.88 * pulse})`;
      g.fill();
      text(g, T("SHIELDED HOUR · CENTRE ×2", "屏蔽时刻 · 中心 ×2"), W / 2, 97.5, 12, "#1b1244", "center", 900);
    }
    // a twist on its way: a chip that throbs under the bar
    if (this.phase === "play" && (this.gateWarn || this.waveWedge >= 0)) {
      const y = this.makersOn ? 114 : 88;
      const pulse = 0.75 + Math.sin(this.clk * 14) * 0.25;
      const gate = this.gateWarn;
      rr(g, W / 2 - 94, y, 188, 22, 11);
      g.fillStyle = gate ? `rgba(255,74,90,${0.92 * pulse})` : `rgba(95,224,255,${0.92 * pulse})`;
      g.fill();
      text(g, gate ? T("⚠ GATES SHIFTING", "⚠ 闸门即将变换") : T("⚠ WAVE INCOMING", "⚠ 海浪来袭"), W / 2, y + 11.5, 12, gate ? "#ffffff" : "#06283a", "center", 900);
    }
    const n = this.news[0];
    if (n) banner(g, n.s, n.t / n.d, n.c, this.phase === "done" ? H * 0.78 : H * 0.3, n.size);
    if (this.human >= 0 && this.phase === "play" && this.t < 4.5) {
      g.globalAlpha = clamp(4.5 - this.t, 0, 1);
      // (a touch screen: wider than the room between the thumbs, so it goes up over the pad)
      const hy = overPad(H - 43, 34 * (fpx(15) / 15));
      grow(g, W / 2, hy, 15, () => {
        rr(g, W / 2 - 250, hy - 17, 500, 34, 17);
        g.fillStyle = "rgba(12,9,28,0.75)";
        g.fill();
        text(g, T("Run over tiles to inscribe them · B shoves · A throws a BATCH", "跑过地砖就能铭刻 · B 推撞 · A 扔批量炸弹"), W / 2, hy + 1, 15, "#fff", "center", 800);
      });
      g.globalAlpha = 1;
    }
  }

  /** The four corners: portrait, name, place and share, the score; the items in hand, the shove's charge. */
  private panels(g: CanvasRenderingContext2D) {
    const counting = this.phase === "tally" || this.phase === "done";
    const pts = this.hudPts;
    for (let i = 0; i < 4; i++) pts[i] = counting ? this.tallyPts[i] : this.points(i);
    const order = this.order ?? rankBy(pts, this.flips);
    let top = 0;
    for (const v of pts) top = Math.max(top, v);
    for (let i = 0; i < 4; i++) {
      const p = this.players[i],
        r = this.run[i];
      const [x, y] = cornerSpot(i);
      const b = this.bump[i];
      g.save();
      g.translate(x, y);
      rr(g, 0, 0, 196, 58, 16);
      g.fillStyle = "rgba(12,9,28,0.76)";
      g.fill();
      // a wash of the seat's colour behind: its share of the board
      const share = this.cnt[i] / this.nTiles;
      g.save();
      rr(g, 0, 0, 196, 58, 16);
      g.clip();
      g.fillStyle = p.color;
      g.globalAlpha = 0.22 + b * 0.25;
      g.fillRect(0, 0, 196 * Math.min(1, share * 2.2), 58);
      g.restore();
      rr(g, 0, 0, 196, 58, 16);
      g.strokeStyle = b > 0.3 ? LILAC : p.human ? p.color : "rgba(255,255,255,0.14)";
      g.lineWidth = p.human || b > 0.3 ? 2.5 : 1;
      g.stroke();
      token(g, p, 30, 29, 20, { shadow: false });
      g.font = `800 12px Geist, Roboto, ui-sans-serif, system-ui, sans-serif`;
      const nm = short(p);
      text(g, nm, 58, 19, 12, p.color, "left", 800);
      // the items in hand
      let ix = 58 + g.measureText(nm).width + 12;
      if (!counting) {
        for (let k = 0; k < r.batches; k++, ix += 18) drawIcon(g, BATCH, ix, 19, 8);
        if (r.bigsig > 0) (drawIcon(g, BIGSIG, ix, 19, 8), (ix += 18));
        if (r.rush > 0) drawIcon(g, RUSH, ix, 19, 8);
      }
      text(g, `${ord(order.indexOf(i))} · ${Math.round(share * 100)}%`, 58, 37, 11, "rgba(255,255,255,0.7)", "left", 700);
      // the shove's charge
      if (!counting) {
        const k = r.cd <= 0 ? 1 : 1 - r.cd / DASH_CD;
        rr(g, 58, 46, 70, 6, 3);
        g.fillStyle = "rgba(255,255,255,0.13)";
        g.fill();
        rr(g, 58, 46, Math.max(6, 70 * k), 6, 3);
        g.fillStyle = k >= 1 ? p.color : "rgba(255,255,255,0.45)";
        g.fill();
        if (k >= 1) text(g, "B", 136, 49.5, 9, "#ffffff", "center", 900);
      }
      const sk = 1 + 0.5 * b * b;
      g.translate(184, 30);
      g.scale(sk, sk);
      text(g, String(pts[i]), 0, 0, 27, b > 0.4 ? "#e6dcff" : "#ffffff", "right", 900);
      g.restore();
      if (top > 0 && pts[i] === top) text(g, "👑", x + 30, y - 1, 16, "#fff", "center");
    }
  }

  /** Under the clock: the board's share, colour by colour (blank on the right). */
  private shareBar(g: CanvasRenderingContext2D, counting: boolean) {
    const w = 300,
      h = 12,
      x0 = W / 2 - w / 2,
      y = counting ? 30 : 66;
    rr(g, x0 - 3, y - 3, w + 6, h + 6, (h + 6) / 2);
    g.fillStyle = "rgba(12,9,28,0.72)";
    g.fill();
    g.save();
    rr(g, x0, y, w, h, h / 2);
    g.clip();
    g.fillStyle = "rgba(255,255,255,0.16)";
    g.fillRect(x0, y, w, h);
    let x = x0;
    for (let i = 0; i < 4; i++) {
      const v = counting ? this.tallyPtr[i] : this.cnt[i];
      const ww = (v / this.nTiles) * w;
      g.fillStyle = this.players[i].color;
      g.fillRect(x, y, ww, h);
      x += ww;
    }
    g.fillStyle = "rgba(255,255,255,0.25)";
    g.fillRect(x0, y, w, 3);
    g.restore();
  }

  result() {
    return this.done;
  }

  dispose() {
    for (const r of this.run) r.a.dispose();
    for (const m of this.iconMats) (m.map?.dispose(), m.dispose());
    disposeScene(this.w.scene);
  }
}

export const INSCRIBE: MiniDef = {
  key: "turf",
  title: "INSCRIBE!",
  titleZh: "铭刻！",
  tag: "Every tile you run over takes your zkSNARK's sigil. Inscribe the most!",
  tagZh: "跑过的地砖都会刻上你的 zkSNARK 印记。刻得最多者胜！",
  help: "Arrows run · B shoves a rival (stamps your sigil round them) · A throws a BATCH · in Shielded Hour the centre counts ×2 · most tiles in 45 s wins",
  helpZh: "方向键跑动 · B 推撞对手（在他周围盖上你的印记）· A 扔批量炸弹 · 屏蔽时刻中心地砖计双倍 · 45 秒内地砖最多者胜",
  pad: ["left", "right", "up", "down", "a", "b"],
  tap: false,
  color: LILAC,
  song: "chase",
  ambience: "city-day",
  variants: LEVELS.map((l) => ({ key: l.key, title: l.title, titleZh: l.titleZh, tag: l.tag, tagZh: l.tagZh, thumb: `turf-${l.key}`, ambience: l.ambience })),
  make: (players, rnd, variant) => new Inscribe(players, rnd, LEVELS.find((l) => l.key === variant) ?? LEVELS[Math.floor(rnd() * LEVELS.length) % LEVELS.length]),
};
export default INSCRIBE;
