/**
 * MEMPOOL RUSH (内存池大抢运): ZK PARTY's block-building scramble, Overcooked-style. The mempool is
 * a neon plaza floating over ZStreet; transaction parcels shoot out of its four intake pads and
 * land all over it. Orange parcels are transparent transactions, lilac ones shielded; each one's
 * fee in ⓩ floats over it. Every player has a block template in a corner: a big open crate of
 * their colour that holds 28 kB. A Sapling parcel weighs 5 kB, a bigger Orchard one 7 kB, so the
 * best block is a little knapsack: high fee per kB.
 *
 * A picks a parcel up; carried, A throws it (from the right range it drops into your crate), and
 * walking into your crate dunks it. B dashes: a dash into a carrier knocks them dizzy and sends
 * their parcel flying. Holding A while standing at a rival's crate lifts their best parcel out,
 * slowly and with an alarm (a shove stops it).
 *
 * A block is found every ~12 s (Zcash's 75 s, sped up): every crate's lid slams shut with a
 * stamp, its fees fly to its owner's panel, and it empties. Four blocks: in the second a WHALE TX
 * drops in the middle of the plaza (its shadow first), the third is the SHIELDED HOUR (lilac pays
 * 2×), the last is shorter and busier (a rush of parcels opens it). Then a fee tally; most ⓩ
 * wins (ties: the best single block, then the most parcels confirmed).
 *
 * The AIs (by skill): they weigh each parcel by its fee per kB, how far it is to fetch and carry,
 * and who else is nearer; they shove carriers near them (a pro more often, the leader first),
 * lift parcels out of crates left unguarded, chase the whale (some of them greedily, right under
 * it) and run a touch slower than you.
 *
 * Three levels (LEVELS below; their sets in mempool-levels/): MEMPOOL PLAZA (the neon plaza at dusk),
 * PORT DOCKS (ZStreet's Proof Factory docks: a long pier at night, the harbour both sides: the crates ride barges that drift up
 * and down the quay, and a parcel that misses the pier sinks) and PROOF FACTORY (a steel deck over
 * the melt: two conveyor belts carry snarks and parcels into the furnaces at their ends, and turn
 * round every few seconds after a klaxon).
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { T } from "../../i18n/lang";
import { music, type SongKey } from "../music";
import { DOCK_XW, DOCK_ZD, docksSet } from "./mempool-levels/docks";
import { BELT_HW, BELT_V, BELT_Z, foundrySet } from "./mempool-levels/foundry";
import type { PoolCtx, PoolLive } from "./mempool-levels/types";
import { Bobs, pools } from "./sign-levels/parts";
import { FONT, H, HUD, W, backOut, clamp, easeOut, fpx, lerp, offThumbs, rankBy, rr, sfx, shout, sound, text, type Input, type Mini, type MiniDef, type Player, type Rnd } from "../kit";
import { Avatar, CamRig, Fx3, GEO, banner, canvasTex, cornerSpot, corners, disposeScene, glow, label, qBlock, short, skyline, tag, toScreen, toon, toonSteps, world, yawOf } from "../k3";
import { INK, badge, crown, numeral, tint, toy } from "../hud";
import { drawMark } from "../theme";
import type { AmbienceKind } from "../../audio/kinds";

// ---- the rules in numbers ------------------------------------------------------------------------

/** The plaza: the rails' inner faces (half width, half depth). */
const XW = 10.5;
const ZD = 7;
/** The snarks a little larger than life, their round bodies, their top speed (m/s). */
const SIZE = 1.22;
const PR = 0.46;
const SPEED = 6.7;
/** Carrying slows you down: a Sapling parcel, an Orchard one, the whale. */
const LOAD = [0.93, 0.84, 0.6];
/** The shove: a dash this fast, this long, then a wait; the dizzy spell it gives, and the grace after. */
const DASH_V = 14;
const DASH_T = 0.2;
const DASH_CD = 0.95;
const RECOVER = 0.25;
const STUN = 0.75;
const IMMUNE = 0.8;
/** How near a parcel must be to be picked up. */
const PICK_R = 1.25;
/** A block template's room (kB), and a parcel's weight by its pool (Sapling, Orchard). */
const CAP = 28;
const W65 = 5;
const W87 = 7;
const WHALE_W = 12;
const WHALE_FEE = 16;
/** The parcels' sizes (m): Sapling, Orchard, the whale. */
const S65 = 0.7;
const S87 = 0.95;
const S_WHALE = 1.45;
/** A crate: its outer half width, its inner one, its walls' height. */
const CH = 1.3;
const CI = 1.08;
const CRATE_H = 1.0;
/** The crates, in the corners under their owners' panels: seat 0 back left, 1 back right, 2 front left, 3 front right. */
const CRATES: readonly (readonly [number, number])[] = [
  [-7.6, -4.2],
  [7.6, -4.2],
  [-7.6, 4.2],
  [7.6, 4.2],
];
/** The intake pads, mid-side. */
const PADS: readonly (readonly [number, number])[] = [
  [0, -ZD + 1.05],
  [0, ZD - 1.05],
  [-XW + 1.05, 0],
  [XW - 1.05, 0],
];
/**
 * A level: its floor (the snarks and the parcels keep in it), its crates and intake pads, the block
 * clock round the middle, its twist (barges, water, belts), its set.
 */
interface Level {
  key: string;
  title: string;
  titleZh: string;
  tag: string;
  tagZh: string;
  song: SongKey;
  ambience: AmbienceKind;
  sky: [string, string];
  fog: [number, number];
  xw: number;
  zd: number;
  crates: readonly (readonly [number, number])[];
  pads: readonly (readonly [number, number])[];
  clock: { r: number; s: number };
  /** The crates ride barges: a drift along x (amplitude m, period s) in each seat's phase. */
  barge?: { amp: number; period: number; phase: number[] };
  /** Water past the floor's front and back: a parcel coming down there sinks. */
  water?: boolean;
  /** Conveyor belts along x (their middles, half width, speed; they turn round every `flip` s). */
  belts?: { z: number[]; hw: number; v: number; flip: number };
  set?: (c: PoolCtx) => PoolLive;
}

const LEVELS: Level[] = [
  {
    key: "plaza",
    title: "MEMPOOL PLAZA",
    titleZh: "内存池广场",
    tag: "The neon plaza at dusk: four crates in the corners, parcels from all sides.",
    tagZh: "黄昏的霓虹广场：四角四个箱子，包裹四面飞来。",
    song: "funk",
    ambience: "city-night",
    sky: ["#1d1560", "#ff9f7e"],
    fog: [70, 250],
    xw: XW,
    zd: ZD,
    crates: CRATES,
    pads: PADS,
    clock: { r: 2.7, s: 1 },
  },
  {
    key: "docks",
    title: "PORT DOCKS",
    titleZh: "港口码头",
    tag: "A pier at night: your crate rides a drifting barge. Miss the pier and the parcel sinks!",
    tagZh: "夜晚的码头：你的箱子在漂移的驳船上。扔出码头，包裹就沉了！",
    song: "marina",
    ambience: "sea",
    sky: ["#0e0b33", "#c2457e"],
    fog: [80, 280],
    xw: DOCK_XW,
    zd: DOCK_ZD,
    crates: [
      [-6.4, -6.1],
      [6.4, -6.1],
      [-6.4, 6.1],
      [6.4, 6.1],
    ],
    pads: [
      [0, -3.6],
      [0, 3.6],
      [-DOCK_XW + 1.05, 0],
      [DOCK_XW - 1.05, 0],
    ],
    clock: { r: 2.0, s: 0.8 },
    barge: { amp: 2.6, period: 13, phase: [0, 0, Math.PI, Math.PI] },
    water: true,
    set: docksSet,
  },
  {
    key: "foundry",
    title: "PROOF FACTORY",
    titleZh: "证明工厂",
    tag: "Over the melt: conveyor belts carry you and the parcels into the furnaces. They turn round!",
    tagZh: "熔炉之上：传送带把你和包裹送进熔炉。它们会反转！",
    song: "hero",
    ambience: "foundry",
    sky: ["#2a1230", "#ff7a3a"],
    fog: [70, 240],
    xw: XW,
    zd: 7.4,
    crates: [
      [-7.6, -4.85],
      [7.6, -4.85],
      [-7.6, 4.85],
      [7.6, 4.85],
    ],
    pads: [
      [0, -6.35],
      [0, 6.35],
      [-XW + 1.05, 0],
      [XW - 1.05, 0],
    ],
    clock: { r: 1.05, s: 0.55 },
    belts: { z: BELT_Z, hw: BELT_HW, v: BELT_V, flip: 7.5 },
    set: foundrySet,
  },
];

/** The four blocks' lengths (s): the last one quicker. */
const BLOCKS = [12, 12, 11.5, 9];
/** The lids stay down this long; the snipe's channel; the tally before the end. */
const SEAL = 1.25;
const SNIPE = 1.3;
const TALLY = 3.6;
/** The parcels' flight. */
const GRAV = 24;
const THROW_V = 8;
const THROW_UP = 6;
/** A carried parcel's bottom over the carrier's feet. */
const HOLD_Y = 2.1;
const CAPP = 48;
/** The bench's balance runs: `&turbo=3` steps the game three times a frame (software WebGL is slow). */
const TURBO = typeof location !== "undefined" && location.pathname.includes("partylab") ? clamp(Math.round(Number(new URLSearchParams(location.search).get("turbo")) || 1), 1, 4) : 1;

const KIND_C = ["#ff7a3d", "#b99cff", "#59e6ff"];
const KIND_BIG = ["#ef5a22", "#9b78f4", "#59e6ff"];
/** The blocks' colours on the tally: glacier, flare, lilac, sage (Void & Flare). */
const BLOCK_C = ["#a8d8e8", "#ff6b35", "#c4b1fc", "#6dbf8a"];
const ACCENT = "#9d7bff";
const LILAC = "#c4b1fc";

/** The colours the frame loop sets, parsed once. */
const COL = {
  white: new THREE.Color("#ffffff"),
  red: new THREE.Color("#ff3355"),
  off: new THREE.Color("#3a3d80"),
  flare: new THREE.Color("#ff6b35"),
  lilac: new THREE.Color(LILAC),
  wash: new THREE.Color("#d8c8ff"),
  lane: new THREE.Color("#7fe0ff"),
  padM: new THREE.Color("#c9b6ff"),
  kind: KIND_C.map((c) => new THREE.Color(c)),
  big: KIND_BIG.map((c) => new THREE.Color(c)),
};

/** A parcel's states. */
const FLY = 0;
const REST = 1;
const CARRY = 2;
const IN = 3;
const GONE = 4;
/** The AI's goals. */
const G_IDLE = 0;
const G_FETCH = 1;
const G_CRATE = 2;
const G_SHOVE = 3;
const G_SNIPE = 4;

interface Parcel {
  on: boolean;
  /** 0 a transfer, 1 a call, 2 the whale. */
  kind: number;
  big: boolean;
  fee: number;
  w: number;
  s: number;
  st: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  g: number;
  ry: number;
  rx: number;
  rz: number;
  spin: number;
  /** Its carrier, its crate's owner, or who threw it last (-1: nobody). */
  seat: number;
  /** Thrown by somebody: it bonks whoever it hits. */
  thrown: boolean;
  /** Not to be picked before this (game time). */
  pickAt: number;
  /** Where it will land (the AI and the shadow know); `wet`: off the floor, into the water. */
  lx: number;
  lz: number;
  wet: boolean;
  /** In a crate: its spot, and the dunk's arc from where it came. */
  sx: number;
  sy: number;
  sz: number;
  fx: number;
  fy: number;
  fz: number;
  k: number;
  born: number;
  /** On the floor since. */
  restAt: number;
  goneT: number;
}

interface Crate {
  seat: number;
  x: number;
  z: number;
  /** Its berth (it drifts round it on a barge) and its speed now. */
  x0: number;
  vx: number;
  items: Parcel[];
  w: number;
  g: THREE.Group;
  lid: THREE.Group;
  stamp: THREE.Mesh;
  lidY: number;
  lidV: number;
  lidRest: number;
  landed: boolean;
  confirmed: boolean;
  beam: THREE.Mesh;
  beamMat: THREE.MeshBasicMaterial;
  zone: THREE.Mesh;
  zoneMat: THREE.MeshBasicMaterial;
  /** -1 open; else the seconds since its lid came down. */
  sealT: number;
  bump: number;
  blocks: number[];
  /** How many parcels it got confirmed over the game. */
  count: number;
  /** The seat lifting a parcel out of it (-1: none). */
  thief: number;
  fullT: number;
  alarmT: number;
  /** The block's fee it showed when sealed (for the flyer). */
  sealedFee: number;
  color: THREE.Color;
}

interface Run {
  a: Avatar;
  p: Player;
  i: number;
  vx: number;
  vz: number;
  dash: number;
  cd: number;
  rec: number;
  stun: number;
  immune: number;
  spin: number;
  dx: number;
  dz: number;
  carry: Parcel | null;
  /** The snipe: its progress (s) and the crate it digs in (-1 none). */
  snipe: number;
  snipeOn: number;
  bufA: number;
  bufB: number;
  lean: number;
  sq: number;
  stars: THREE.Group;
  angryT: number;
  jumpAt: number;
  hurt: number;
  // the AI
  think: number;
  goal: number;
  tgt: Parcel | null;
  tgtSeat: number;
  tx: number;
  tz: number;
  throwPlan: boolean;
  greed: number;
  wander: number;
}

interface Pop {
  x: number;
  y: number;
  z: number;
  s: string;
  c: string;
  t: number;
  big: boolean;
}
interface Flyer {
  seat: number;
  s: string;
  x0: number;
  y0: number;
  t: number;
  v: number;
  done: boolean;
}
interface Ban {
  s: string;
  c: string;
  t: number;
  dur: number;
  size: number;
  y: number;
}
interface Ring {
  m: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  t: number;
  dur: number;
  r0: number;
  r1: number;
  a0: number;
  on: boolean;
}

// ---- small things --------------------------------------------------------------------------------

function beep(f: number, dur: number, type: OscillatorType = "square", vol = 0.3, slide = 0, delay = 0) {
  const s = sound();
  if (!s) return;
  const t = s.ac.currentTime + delay;
  const o = s.ac.createOscillator();
  const g = s.ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(s.bus);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** An AI's top speed against yours: 0.87 at skill 0.5, 0.95 at 0.9 (a pro is nearly as quick as you). */
const aiPace = (sk: number) => 0.8 + 0.1 * sk + 0.08 * sk * sk;

/** A little ⓩ coin on the HUD (the glyph itself reads like a ©): a disc with a Z. */
function chip(g: CanvasRenderingContext2D, x: number, y: number, r: number, fill = "#ff6b35", ink = "#ffffff") {
  g.beginPath();
  g.arc(x, y + r * 0.16, r + 1.5, 0, Math.PI * 2);
  g.fillStyle = INK;
  g.fill();
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = fill;
  g.fill();
  g.beginPath();
  g.arc(x, y - r * 0.12, r * 0.72, Math.PI * 1.1, Math.PI * 1.9);
  g.lineWidth = Math.max(1, r * 0.16);
  g.strokeStyle = "rgba(255,255,255,0.45)";
  g.stroke();
  text(g, "Z", x, y + r * 0.06, r * 1.25, ink, "center", 900);
}
/** A fee: the coin, then the figure (outlined numerals), from x leftward ("right") or rightward ("left"). */
function fee(g: CanvasRenderingContext2D, v: string, x: number, y: number, size: number, color = "#ffffff", align: "left" | "right" | "center" = "right") {
  g.font = `900 ${size}px ${FONT}`;
  const tw = g.measureText(v).width;
  const r = size * 0.36;
  const w = tw + r * 2 + size * 0.18;
  const x0 = align === "left" ? x : align === "right" ? x - w : x - w / 2;
  chip(g, x0 + r, y - size * 0.02, r);
  numeral(g, v, x0 + w, y, size, color, "right");
}

type Kind = "box" | "cyl" | "ball" | "cone";
interface Piece {
  k: Kind;
  c: string;
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  ry: number;
  rx: number;
  rz: number;
  ink: number;
  lit: boolean;
}
/** Every static piece of the set, drawn as a few InstancedMeshes (toon, unlit, and their ink hulls). */
class Batch {
  private p: Piece[] = [];
  add(k: Kind, c: string, sx: number, sy: number, sz: number, x: number, y: number, z: number, o: { ry?: number; rx?: number; rz?: number; ink?: number; lit?: boolean } = {}) {
    this.p.push({ k, c, sx, sy, sz, x, y, z, ry: o.ry ?? 0, rx: o.rx ?? 0, rz: o.rz ?? 0, ink: o.ink ?? 0, lit: !!o.lit });
  }
  /** A box standing on y (its bottom at y). */
  box(c: string, w: number, h: number, d: number, x: number, y: number, z: number, ink = 0, ry = 0) {
    this.add("box", c, w, h, d, x, y + h / 2, z, { ink, ry });
  }
  lit(c: string, w: number, h: number, d: number, x: number, y: number, z: number) {
    this.add("box", c, w, h, d, x, y + h / 2, z, { lit: true });
  }
  cyl(c: string, r: number, h: number, x: number, y: number, z: number, ink = 0) {
    this.add("cyl", c, r * 2, h, r * 2, x, y + h / 2, z, { ink });
  }
  build(scene: THREE.Scene, ink: THREE.Material) {
    const M = new THREE.Matrix4(),
      Q = new THREE.Quaternion(),
      E = new THREE.Euler(),
      P = new THREE.Vector3(),
      S = new THREE.Vector3(),
      C = new THREE.Color();
    const groups = new Map<string, Piece[]>();
    for (const q of this.p) {
      const key = `${q.k}:${q.lit ? 1 : 0}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(q);
      if (q.ink) {
        const ik = `${q.k}:ink`;
        if (!groups.has(ik)) groups.set(ik, []);
        groups.get(ik)!.push(q);
      }
    }
    for (const [key, list] of groups) {
      const [k, mode] = key.split(":") as [Kind, string];
      const isInk = mode === "ink";
      const mat = isInk ? ink : mode === "1" ? glow("#ffffff") : toon("#ffffff");
      const mesh = new THREE.InstancedMesh(GEO[k], mat, list.length);
      list.forEach((q, i) => {
        E.set(q.rx, q.ry, q.rz, "YXZ");
        Q.setFromEuler(E);
        const t = isInk ? q.ink * 2 : 0;
        M.compose(P.set(q.x, q.y, q.z), Q, S.set(q.sx + t, q.sy + t, q.sz + t));
        mesh.setMatrixAt(i, M);
        if (!isInk) mesh.setColorAt(i, C.set(q.c));
      });
      mesh.raycast = () => {};
      mesh.frustumCulled = false;
      scene.add(mesh);
    }
  }
}

/** Soft round marks on the floor (the parcels' shadows): one instanced draw. */
class Marks {
  readonly mesh: THREE.InstancedMesh;
  private n = 0;
  private cap: number;
  private m = new THREE.Matrix4();
  private col: THREE.InstancedBufferAttribute;
  constructor(scene: THREE.Scene, cap = 64) {
    this.cap = cap;
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      vertexShader: `varying vec2 vUv; varying vec3 vC;
        void main() { vUv = uv; vC = instanceColor; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec2 vUv; varying vec3 vC;
        void main() { float d = length(vUv - 0.5) * 2.0; float a = (1.0 - smoothstep(mix(0.45, 0.0, vC.g), 1.0, d)) * vC.r; gl_FragColor = vec4(0.03, 0.02, 0.10, a); }`,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.col = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.mesh.instanceColor = this.col;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }
  begin() {
    this.n = 0;
  }
  add(x: number, z: number, r: number, a: number, soft = 0.3, y = 0.025) {
    if (this.n >= this.cap || a <= 0.005) return;
    this.m.makeScale(r * 2, 1, r * 2).setPosition(x, y, z);
    this.mesh.setMatrixAt(this.n, this.m);
    this.col.setXYZ(this.n, a, soft, 0);
    this.n++;
  }
  end() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.col.needsUpdate = true;
  }
}

/** Boxes [w, h, d, x, y, z] (y: the bottom) merged into one geometry, each grown by `grow` (an ink hull). */
function boxes(list: number[][], grow = 0) {
  const parts = list.map(([w, h, d, x, y, z]) => new THREE.BoxGeometry(w + grow * 2, h + grow * 2, d + grow * 2).translate(x, y + h / 2, z));
  const g = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  return g;
}

// ---- the game ------------------------------------------------------------------------------------

class Mempool implements Mini {
  private w: ReturnType<typeof world>;
  private L: Level;
  private xw: number;
  private zd: number;
  private live: PoolLive | null = null;
  /** The belts: their speed now (signed: the back belt's way), the way they run, the next turn, its warning. */
  private beltV = 0;
  private beltDir = 1;
  private flipAt = 0;
  private warnB = 0;
  private bargePh = 0;
  private flipsB = 0;
  private cam: CamRig;
  private fx: Fx3;
  private marks: Marks;
  private run: Run[];
  private crates: Crate[] = [];
  private parcels: Parcel[] = [];
  private human: number;
  private score = [0, 0, 0, 0];
  private shown = [0, 0, 0, 0];
  private t = 0;
  private clk = 0;
  private blk = 0;
  private blkT = 0;
  private phase: "card" | "count" | "play" | "tally" = "card";
  private tallyT = 0;
  private final: number[] | null = null;
  private over: number[] | null = null;
  private post = 0;
  private makers = false;
  private spawnAt = 0.3;
  private padNext = 0;
  private padGlow = [0, 0, 0, 0];
  private pending: { pad: number; at: number; kind: number; big: boolean; fee: number }[] = [];
  private whaleDone = [false];
  private whale: Parcel | null = null;
  private lastTick = -1;
  private banners: Ban[] = [];
  private pops: Pop[] = [];
  private flyers: Flyer[] = [];
  private rings: Ring[] = [];
  private bump = [0, 0, 0, 0];
  private leadL: number[] = [];
  private valsL = ["", "", "", ""];
  private subL = ["", "", "", ""];
  private loss = [0, 0, 0, 0];
  private flash = 0;
  private hurtFx = 0;
  // the set's moving parts
  private ink: THREE.MeshBasicMaterial;
  private body: THREE.InstancedMesh;
  private hull: THREE.InstancedMesh;
  private tape: THREE.InstancedMesh;
  private lights!: THREE.InstancedMesh;
  private tail!: THREE.Mesh;
  private tailMat!: THREE.MeshBasicMaterial;
  private lanes: THREE.MeshBasicMaterial;
  private pads: { disc: THREE.Mesh; mat: THREE.MeshBasicMaterial; ring: THREE.Mesh }[] = [];
  private halo: THREE.Mesh;
  private haloMat: THREE.MeshBasicMaterial;
  private danger: THREE.Mesh;
  private dangerMat: THREE.MeshBasicMaterial;
  private stampMats: THREE.MeshBasicMaterial[] = [];
  private starGeo: THREE.OctahedronGeometry;
  private hemi0 = new THREE.Color();
  // scratch
  private eye = new THREE.Vector3();
  private at = new THREE.Vector3();
  private v = new THREE.Vector3();
  private M = new THREE.Matrix4();
  private Q = new THREE.Quaternion();
  private E = new THREE.Euler();
  private P = new THREE.Vector3();
  private S = new THREE.Vector3();
  private C = new THREE.Color();
  // the AI's hands this frame
  private mx = 0;
  private mz = 0;
  private sub0 = true;
  private cxs = [0, 0, 0, 0];
  /** The plaza's background life (clouds, sparkles, Z-Blocks). */
  private decor: Bobs[] = [];
  private qbs: THREE.Object3D[] = [];
  private czs = [0, 0, 0, 0];
  /** For the bench: who shoved, stole, threw in, and banked the whale. */
  readonly stats = { tackles: [0, 0, 0, 0], steals: [0, 0, 0, 0], throwsIn: [0, 0, 0, 0], picks: [0, 0, 0, 0], whale: [0, 0, 0, 0], bonks: 0, evicted: 0, sunk: 0 };
  private wantA = false;
  private holdA = false;
  private wantB = false;
  private bdx = 0;
  private bdz = 1;

  constructor(
    private players: Player[],
    private rnd: Rnd,
    level: Level,
  ) {
    this.L = level;
    this.xw = level.xw;
    this.zd = level.zd;
    this.w = world({ sky: level.sky, fog: level.fog, fov: 44 });
    // (which way the belts start, where the barges start: the seed's, so no seat keeps the luck)
    if (level.belts) ((this.beltDir = rnd() < 0.5 ? 1 : -1), (this.beltV = this.beltDir * level.belts.v), (this.flipAt = level.belts.flip));
    if (level.barge) this.bargePh = rnd() * Math.PI * 2;
    const s = this.w.scene;
    this.human = players.findIndex((p) => p.human);
    this.ink = new THREE.MeshBasicMaterial({ color: 0x15101f, side: THREE.BackSide });
    this.hemi0.copy(this.w.hemi.color);
    this.w.sun.intensity = 2.1;
    this.lanes = new THREE.MeshBasicMaterial({ color: "#7fe0ff", transparent: true, opacity: 0.9, depthWrite: false });
    this.buildSet();
    if (!level.set) skyline(s, { r: 150, n: 64, y: -46, rnd, night: true, tall: 1.5 });
    this.fx = new Fx3(s, 700);
    this.marks = new Marks(s, 64);
    // the parcels: bodies, ink hulls and the tape round them (three draws for all of them)
    this.body = new THREE.InstancedMesh(GEO.box, toon("#ffffff"), CAPP);
    this.hull = new THREE.InstancedMesh(GEO.box, this.ink, CAPP);
    this.tape = new THREE.InstancedMesh(GEO.box, toon("#fff4e2"), CAPP * 2);
    for (const m of [this.body, this.hull, this.tape]) {
      m.count = 0;
      m.frustumCulled = false;
      m.raycast = () => {};
      s.add(m);
    }
    this.body.setColorAt(0, this.C.set("#ffffff"));
    for (let i = 0; i < CAPP; i++) this.parcels.push(this.blank());
    // the whale's halo and the danger mark where it will land
    this.haloMat = new THREE.MeshBasicMaterial({ color: "#7ff0ff", transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false });
    this.halo = new THREE.Mesh(GEO.ball, this.haloMat);
    this.halo.visible = false;
    s.add(this.halo);
    this.dangerMat = new THREE.MeshBasicMaterial({ map: this.dangerTex(), transparent: true, depthWrite: false, opacity: 0 });
    this.danger = new THREE.Mesh(GEO.plane, this.dangerMat);
    this.danger.rotation.x = -Math.PI / 2;
    this.danger.renderOrder = 3;
    this.danger.visible = false;
    s.add(this.danger);
    this.starGeo = new THREE.OctahedronGeometry(0.13);
    // the snarks, each in front of its crate
    this.run = players.map((p, i) => {
      const a = new Avatar(s, p, { scale: SIZE });
      const [cx, cz] = level.crates[i];
      a.pos.set(cx * 0.66, 0, clamp(cz * 0.5, -level.zd + 1.6, level.zd - 1.6));
      a.yaw = yawOf(-a.pos.x, -a.pos.z);
      a.sync(0);
      const stars = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        const st = new THREE.Mesh(this.starGeo, glow(k === 1 ? "#ffffff" : "#ffe14a"));
        const an = (k / 3) * Math.PI * 2;
        st.position.set(Math.sin(an) * 0.42, 0, Math.cos(an) * 0.42);
        st.scale.set(1, 1.4, 1);
        stars.add(st);
      }
      stars.visible = false;
      s.add(stars);
      return {
        a,
        p,
        i,
        vx: 0,
        vz: 0,
        dash: 0,
        cd: 0,
        rec: 0,
        stun: 0,
        immune: 0,
        spin: 0,
        dx: 0,
        dz: 1,
        carry: null,
        snipe: 0,
        snipeOn: -1,
        bufA: 0,
        bufB: 0,
        lean: 0,
        sq: 0,
        stars,
        angryT: 0,
        jumpAt: 0,
        hurt: 0,
        think: 0.15 + rnd() * 0.3,
        goal: G_IDLE,
        tgt: null,
        tgtSeat: -1,
        tx: 0,
        tz: 0,
        throwPlan: false,
        greed: 0.8 + rnd() * 1.2,
        wander: 0,
      };
    });
    // the mempool is never empty: a first handful on the floor
    for (let k = 0; k < 9; k++) {
      const p = this.alloc();
      if (!p) break;
      this.roll(p, k % 3 === 1 ? 1 : 0, rnd() < 0.35);
      this.spot(level.pads[k % 4][0], level.pads[k % 4][1], p);
      p.x = p.lx;
      p.z = p.lz;
      p.y = p.s / 2;
      p.st = REST;
      p.restAt = 0;
      p.born = -1;
    }
    this.cam = new CamRig(this.w.camera);
    this.playCam();
    this.cam.set(this.eye, this.at);
    // (the barges where they start)
    this.drift(0);
    if (location.pathname.includes("partylab")) (window as unknown as { __mempool?: unknown }).__mempool = this;
  }

  // ---- the set -----------------------------------------------------------------------------------

  private buildSet() {
    const s = this.w.scene;
    const B = new Batch();
    const L = this.L;
    // the level's own set, or the plaza's
    if (L.set) this.live = L.set({ scene: s, hemi: this.w.hemi, sun: this.w.sun, rnd: this.rnd, ink: this.ink, players: this.players, xw: this.xw, zd: this.zd, crates: L.crates, pads: L.pads });
    else this.buildPlaza(B);
    const ck = L.clock;
    // the block clock round the ⓩ: twelve light tiles, one a second, clockwise from the top
    this.lights = new THREE.InstancedMesh(GEO.box, new THREE.MeshBasicMaterial({ color: 0xffffff }), 12);
    for (let k = 0; k < 12; k++) {
      const a = -Math.PI * 0.5 + ((k + 0.5) / 12) * Math.PI * 2;
      this.Q.setFromAxisAngle(this.v.set(0, 1, 0), -a);
      this.M.compose(this.P.set(Math.cos(a) * ck.r, 0.04, Math.sin(a) * ck.r), this.Q, this.S.set(0.52 * ck.s, 0.06, 0.62 * ck.s));
      this.lights.setMatrixAt(k, this.M);
      this.lights.setColorAt(k, this.C.set("#3a3d80"));
    }
    this.lights.frustumCulled = false;
    s.add(this.lights);
    this.tailMat = new THREE.MeshBasicMaterial({ color: "#ff6b35" });
    this.tail = new THREE.Mesh(GEO.box, this.tailMat);
    // (its tail: a flare marker at the top, between the last tile and the first)
    this.tail.scale.set(0.45 * ck.s, 0.12, 0.45 * ck.s);
    this.tail.position.set(0, 0.06, -ck.r);
    this.tail.rotation.y = -Math.PI * 0.25;
    s.add(this.tail);
    // the pads: a white ring, a glowing disc that flares before it shoots, a halo turning over it
    for (const [px, pz] of L.pads) {
      B.cyl("#eeeaff", 0.95, 0.1, px, 0, pz, 0.03);
      B.cyl("#2b2560", 0.78, 0.11, px, 0, pz, 0);
      const mat = new THREE.MeshBasicMaterial({ color: "#7fe0ff", transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
      const disc = new THREE.Mesh(GEO.disc, mat);
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(px, 0.125, pz);
      disc.scale.setScalar(1.4);
      disc.renderOrder = 3;
      const ring = new THREE.Mesh(GEO.ring, glow("#c9f3ff", 0.75, true));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(px, 0.5, pz);
      ring.scale.setScalar(1.7);
      s.add(disc, ring);
      this.pads.push({ disc, mat, ring });
    }
    // the crates: an open box of the seat's colour, white corner posts, a light round its rim
    L.crates.forEach(([cx, cz], i) => {
      const p = this.players[i];
      const g = new THREE.Group();
      g.position.set(cx, 0, cz);
      const t = 0.22;
      const wallList = [
        [CH * 2, CRATE_H, t, 0, 0, CH - t / 2],
        [CH * 2, CRATE_H, t, 0, 0, -CH + t / 2],
        [t, CRATE_H, CH * 2 - t * 2, CH - t / 2, 0, 0],
        [t, CRATE_H, CH * 2 - t * 2, -CH + t / 2, 0, 0],
        [CH * 2 - t * 2, 0.14, CH * 2 - t * 2, 0, 0, 0],
      ];
      const postList = [
        [0.34, CRATE_H + 0.12, 0.34, CH - 0.12, 0, CH - 0.12],
        [0.34, CRATE_H + 0.12, 0.34, -CH + 0.12, 0, CH - 0.12],
        [0.34, CRATE_H + 0.12, 0.34, CH - 0.12, 0, -CH + 0.12],
        [0.34, CRATE_H + 0.12, 0.34, -CH + 0.12, 0, -CH + 0.12],
        // the planks' slats on the front
        [CH * 2 - 0.5, 0.1, 0.05, 0, 0.3, CH + 0.01],
        [CH * 2 - 0.5, 0.1, 0.05, 0, 0.62, CH + 0.01],
      ];
      const walls = new THREE.Mesh(boxes(wallList), toon(p.color));
      const posts = new THREE.Mesh(boxes(postList), toon(tint(p.color, 0.55)));
      const hull = new THREE.Mesh(boxes([...wallList, ...postList.slice(0, 4)], 0.05), this.ink);
      const rimList = [
        [CH * 2 - 0.5, 0.06, 0.06, 0, CRATE_H - 0.02, CH - t - 0.02],
        [CH * 2 - 0.5, 0.06, 0.06, 0, CRATE_H - 0.02, -CH + t + 0.02],
        [0.06, 0.06, CH * 2 - 0.5, CH - t - 0.02, CRATE_H - 0.02, 0],
        [0.06, 0.06, CH * 2 - 0.5, -CH + t + 0.02, CRATE_H - 0.02, 0],
      ];
      const rim = new THREE.Mesh(boxes(rimList), glow(tint(p.color, 0.4)));
      g.add(walls, posts, hull, rim);
      const name = label(short(p), 0.42, "#ffffff", tint(p.color, -0.45));
      name.position.set(0, 0.47, CH + 0.04);
      name.scale.set(1.9, 0.48, 1);
      g.add(name);
      s.add(g);
      // the lid that slams down when the block is found, its stamp
      const lid = new THREE.Group();
      const lb = new THREE.Mesh(GEO.box, toon(tint(p.color, 0.25)));
      lb.scale.set(CH * 2 + 0.14, 0.26, CH * 2 + 0.14);
      const lh = new THREE.Mesh(GEO.box, this.ink);
      lh.scale.set(CH * 2 + 0.24, 0.36, CH * 2 + 0.24);
      const stamp = new THREE.Mesh(GEO.plane, glow("#ffffff"));
      stamp.rotation.x = -Math.PI / 2;
      stamp.position.y = 0.14;
      stamp.scale.setScalar(2.2);
      lid.add(lb, lh, stamp);
      lid.visible = false;
      s.add(lid);
      // the light that goes up when the block is found
      const beamMat = new THREE.MeshBasicMaterial({ color: tint(p.color, 0.5), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.15, 1, 24, 1, true), beamMat);
      beam.position.set(cx, 6, cz);
      beam.scale.set(CH * 0.95, 12, CH * 0.95);
      beam.visible = false;
      s.add(beam);
      // a glow round the zone (it flashes red while somebody lifts a parcel out)
      const zoneMat = new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false });
      const zone = new THREE.Mesh(GEO.ring, zoneMat);
      zone.rotation.x = -Math.PI / 2;
      zone.position.set(cx, 0.05, cz);
      zone.scale.setScalar(5.6);
      zone.renderOrder = 3;
      s.add(zone);
      this.crates.push({
        seat: i,
        x: cx,
        z: cz,
        x0: cx,
        vx: 0,
        items: [],
        w: 0,
        g,
        lid,
        stamp,
        lidY: 9,
        lidV: 0,
        lidRest: CRATE_H + 0.13,
        landed: false,
        confirmed: false,
        beam,
        beamMat,
        zone,
        zoneMat,
        sealT: -1,
        bump: 0,
        blocks: [0, 0, 0, 0],
        count: 0,
        thief: -1,
        fullT: 0,
        alarmT: 0,
        sealedFee: 0,
        color: new THREE.Color(p.color),
      });
    });
    // the stamps, one per block
    for (let b = 0; b < 4; b++) {
      const st = canvasTex(256, 256, (g) => {
        g.translate(128, 128);
        g.rotate(-0.18);
        g.fillStyle = "rgba(255,255,255,0.0)";
        g.fillRect(-128, -128, 256, 256);
        g.lineWidth = 14;
        g.strokeStyle = INK;
        g.beginPath();
        g.arc(0, 0, 104, 0, Math.PI * 2);
        g.stroke();
        g.lineWidth = 8;
        g.strokeStyle = "#ffffff";
        g.beginPath();
        g.arc(0, 0, 104, 0, Math.PI * 2);
        g.stroke();
        g.beginPath();
        g.arc(0, 0, 84, 0, Math.PI * 2);
        g.stroke();
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.lineJoin = "round";
        g.font = `900 30px ${FONT}`;
        g.lineWidth = 8;
        g.strokeStyle = INK;
        g.strokeText("BLOCK", 0, -40);
        g.fillStyle = "#ffffff";
        g.fillText("BLOCK", 0, -40);
        g.font = `900 92px ${FONT}`;
        g.lineWidth = 12;
        g.strokeText(`#${b + 1}`, 0, 16);
        g.fillText(`#${b + 1}`, 0, 16);
        g.font = `900 22px ${FONT}`;
        g.lineWidth = 6;
        g.strokeText("FOUND ✓", 0, 66);
        g.fillText("FOUND ✓", 0, 66);
      });
      this.stampMats.push(new THREE.MeshBasicMaterial({ map: st, transparent: true, depthWrite: false }));
    }
    B.build(s, this.ink);
  }

  /** MEMPOOL PLAZA's set: the floor, the lanes, the slab and its lights, the rails, the lamps, the bunting, the sign, the clouds. */
  private buildPlaza(B: Batch) {
    const s = this.w.scene;
    const rnd = this.rnd;
    const FW = XW * 2,
      FD = ZD * 2;
    const PX = 40;
    // the floor: deep indigo tiles, the crates' zones, the lanes from the pads, the ⓩ in the middle
    const tex = canvasTex(FW * PX, FD * PX, (g) => {
      g.fillStyle = "#1c1d4a";
      g.fillRect(0, 0, FW * PX, FD * PX);
      for (let j = 0; j < FD; j++)
        for (let i = 0; i < FW; i++) {
          const odd = (i + j) % 2;
          g.fillStyle = odd ? "#2c2f72" : "#282a68";
          rr(g, i * PX + 2, j * PX + 2, PX - 4, PX - 4, 6);
          g.fill();
          g.fillStyle = "rgba(255,255,255,0.05)";
          rr(g, i * PX + 4, j * PX + 3, PX - 8, 5, 2);
          g.fill();
        }
      const X = (x: number) => (x + XW) * PX,
        Z = (z: number) => (z + ZD) * PX;
      // the crates' zones: a pad of the seat's colour, hazard stripes round it
      CRATES.forEach(([cx, cz], i) => {
        const c = this.players[i].color;
        const h = 2.25;
        g.save();
        rr(g, X(cx - h), Z(cz - h), h * 2 * PX, h * 2 * PX, 18);
        g.clip();
        g.fillStyle = tint(c, -0.55);
        g.fillRect(X(cx - h), Z(cz - h), h * 2 * PX, h * 2 * PX);
        g.strokeStyle = c;
        g.lineWidth = 12;
        for (let k = -12; k < 12; k++) {
          g.beginPath();
          g.moveTo(X(cx - h) + k * 22, Z(cz - h));
          g.lineTo(X(cx - h) + k * 22 + h * 2 * PX, Z(cz + h));
          g.stroke();
        }
        g.fillStyle = tint(c, -0.45);
        rr(g, X(cx - h + 0.32), Z(cz - h + 0.32), (h - 0.32) * 2 * PX, (h - 0.32) * 2 * PX, 12);
        g.fill();
        g.restore();
        g.strokeStyle = "#ffffff";
        g.lineWidth = 3;
        rr(g, X(cx - h), Z(cz - h), h * 2 * PX, h * 2 * PX, 18);
        g.stroke();
      });
      // the ⓩ mark in the middle: a ring (the block clock sits on it), a faint Z inside
      const cx = X(0),
        cz = Z(0);
      g.lineCap = "butt";
      g.strokeStyle = "rgba(255,255,255,0.12)";
      g.lineWidth = 0.9 * PX;
      g.beginPath();
      g.arc(cx, cz, 2.7 * PX, 0, Math.PI * 2);
      g.stroke();
      drawMark(g, cx, cz, 4.6 * PX, "rgba(0,0,0,0)", "rgba(255,255,255,0.12)");
      g.strokeStyle = "rgba(196,177,252,0.55)";
      g.lineWidth = 4;
      g.setLineDash([14, 10]);
      g.beginPath();
      g.arc(cx, cz, 1.6 * PX, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
      // the rim of the plaza
      g.strokeStyle = "#a8d8e8";
      g.lineWidth = 6;
      g.strokeRect(6, 6, FW * PX - 12, FD * PX - 12);
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(FW, FD).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ map: tex, gradientMap: toonSteps(), emissive: 0x101030 }));
    s.add(floor);
    // the lanes: dotted light from each pad toward the middle (one material: lilac in the Shielded Hour)
    const laneGeo: THREE.BufferGeometry[] = [];
    for (const [px, pz] of PADS) {
      const len = Math.hypot(px, pz) - 3.2;
      const nx = -px / Math.hypot(px, pz),
        nz = -pz / Math.hypot(px, pz);
      for (let d = 1.1; d < len; d += 0.75) {
        const gq = new THREE.PlaneGeometry(0.16, 0.34).rotateX(-Math.PI / 2);
        gq.rotateY(Math.atan2(nx, nz));
        gq.translate(px + nx * d, 0.02, pz + nz * d);
        laneGeo.push(gq);
      }
    }
    const lanes = new THREE.Mesh(mergeGeometries(laneGeo)!, this.lanes);
    for (const gq of laneGeo) gq.dispose();
    lanes.renderOrder = 1;
    s.add(lanes);
    // the slab it floats on, the lights under its edge
    B.box("#3b3484", FW + 1.6, 0.7, FD + 1.6, 0, -0.7, 0, 0.05);
    B.box("#2a2462", FW + 0.4, 1.4, FD + 0.4, 0, -2.1, 0, 0.05);
    B.box("#221d50", FW - 3, 1.6, FD - 3, 0, -3.7, 0, 0.04);
    for (let k = 0; k < 28; k++) {
      const u = (k + 0.5) / 28;
      const c = ["#ff6b35", "#c4b1fc", "#a8d8e8", "#6dbf8a"][k % 4];
      B.lit(c, 0.5, 0.18, 0.05, -FW / 2 + u * FW, -0.48, FD / 2 + 0.82);
      B.lit(c, 0.5, 0.18, 0.05, -FW / 2 + u * FW, -0.48, -FD / 2 - 0.82);
    }
    for (let k = 0; k < 18; k++) {
      const u = (k + 0.5) / 18;
      const c = ["#a8d8e8", "#ff6b35", "#c4b1fc", "#6dbf8a"][k % 4];
      B.lit(c, 0.05, 0.18, 0.5, FW / 2 + 0.82, -0.48, -FD / 2 + u * FD);
      B.lit(c, 0.05, 0.18, 0.5, -FW / 2 - 0.82, -0.48, -FD / 2 + u * FD);
    }
    // the rails: low white walls with a glowing cap, posts at the corners
    const rail = (w: number, d: number, x: number, z: number) => {
      B.box("#eeeaff", w, 0.42, d, x, 0, z, 0.04);
      B.lit("#a8d8e8", w + 0.02, 0.07, d + 0.02, x, 0.42, z);
    };
    rail(FW + 0.6, 0.3, 0, ZD + 0.15);
    rail(FW + 0.6, 0.3, 0, -ZD - 0.15);
    rail(0.3, FD, XW + 0.15, 0);
    rail(0.3, FD, -XW - 0.15, 0);
    // lamp posts round the edge
    const glows: { x: number; y: number; z: number; r: number; c: string; a: number }[] = [];
    const lamp = (x: number, z: number, c: string) => {
      glows.push({ x: clamp(x, -XW + 1.2, XW - 1.2), y: 0.03, z: clamp(z, -ZD + 1.2, ZD - 1.2), r: 2.6, c, a: 0.22 });
      B.box("#2b2560", 0.34, 0.3, 0.34, x, 0.42, z, 0.03);
      B.cyl("#2b2560", 0.07, 2.4, x, 0.6, z, 0.025);
      B.add("ball", c, 0.42, 0.42, 0.42, x, 3.15, z, { lit: true });
      B.add("cone", "#2b2560", 0.56, 0.24, 0.56, x, 3.48, z, { ry: Math.PI / 4, ink: 0.02 });
    };
    lamp(-XW - 0.15, -ZD - 0.15, "#ff6b35");
    lamp(XW + 0.15, -ZD - 0.15, "#c4b1fc");
    lamp(-XW - 0.15, ZD + 0.15, "#c4b1fc");
    lamp(XW + 0.15, ZD + 0.15, "#ff6b35");
    lamp(-4.5, -ZD - 0.15, "#a8d8e8");
    lamp(4.5, -ZD - 0.15, "#a8d8e8");
    pools(s, glows);
    // background life: clouds drifting under the plaza, sparkles round its rim, a Z-Block each side
    const cl: { x: number; y: number; z: number; s: number; w: number; h: number; dd: number }[] = [];
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2 + Math.random() * 0.2;
      const r = 17 + Math.random() * 24;
      cl.push({ x: Math.cos(a) * r, y: -12 - Math.random() * 7, z: Math.sin(a) * r * 0.85, s: 1, w: 6 + Math.random() * 8, h: 1.6 + Math.random() * 1.5, dd: 4 + Math.random() * 5 });
    }
    this.decor.push(new Bobs(s, GEO.box, new THREE.MeshToonMaterial({ color: "#ffd9cc", emissive: new THREE.Color("#4a2850"), gradientMap: toonSteps() }), cl, { bob: 0.3, speed: 0.3, slide: 0.6, wrap: 44, spin: 0 }));
    const sp: { x: number; y: number; z: number; s: number; c: string }[] = [];
    for (let k = 0; k < 40; k++) {
      const side = k % 4;
      const x = side < 2 ? (side ? 1 : -1) * (XW + 1.2 + Math.random() * 2.5) : (Math.random() - 0.5) * (FW + 2);
      const z = side < 2 ? (Math.random() - 0.5) * FD : (side === 2 ? -1 : 1) * (ZD + 1.2 + Math.random() * 2);
      sp.push({ x, y: 0.3 + Math.random() * 4, z, s: 0.1 + Math.random() * 0.08, c: ["#ff6b35", "#c4b1fc", "#a8d8e8", "#ffffff"][k % 4] });
    }
    this.decor.push(new Bobs(s, GEO.box, new THREE.MeshBasicMaterial({ color: 0xffffff }), sp, { bob: 0.35, twinkle: 0.9, drift: 0.3, speed: 0.7 }));
    for (const sx of [-1, 1]) {
      const qb = qBlock(1.3);
      qb.position.set(sx * 13.4, 5.2, -4.5);
      s.add(qb);
      this.qbs.push(qb);
    }
    // bunting along the back: the four seats' colours and the two factions'
    const flags = ["#ff6b35", "#3ec6ff", "#8ee35b", "#ff5fa2", "#c4b1fc"];
    const spans = [
      [-XW - 0.15, -4.5],
      [-4.5, 4.5],
      [4.5, XW + 0.15],
    ];
    spans.forEach(([x0, x1], si) => {
      const n = Math.round((x1 - x0) / 0.62);
      for (let k = 0; k < n; k++) {
        const u = (k + 0.5) / n;
        const x = x0 + u * (x1 - x0);
        const y = 3.05 - Math.sin(u * Math.PI) * 0.55;
        B.add("box", flags[(k + si) % flags.length], 0.3, 0.3, 0.03, x, y - 0.16, -ZD - 0.15, { rz: Math.PI / 4, ink: 0.015 });
      }
    });
    // the MEMPOOL sign at the back, on two legs
    B.box("#2b2560", 0.14, 0.4, 0.14, -2.0, 0.42, -ZD - 0.5, 0.02);
    B.box("#2b2560", 0.14, 0.4, 0.14, 2.0, 0.42, -ZD - 0.5, 0.02);
    B.box("#2b2560", 4.9, 0.8, 0.2, 0, 0.72, -ZD - 0.55, 0.04);
    const sign = label("MEMPOOL", 0.62, "#ffffff", "");
    sign.position.set(0, 1.14, -ZD - 0.43);
    s.add(sign);
    // clouds drifting below the plaza and far round it
    for (let i = 0; i < 9; i++) {
      const a = -1.4 + (i / 8) * 2.8 + rnd() * 0.2;
      const d = 55 + rnd() * 50;
      const cx = Math.sin(a) * d,
        cz = -Math.cos(a) * d * 0.9,
        cy = -14 + rnd() * 26;
      const parts = 3 + Math.floor(rnd() * 3);
      for (let k = 0; k < parts; k++) B.add("box", i % 3 ? "#ffd9cc" : "#ffffff", 6 + rnd() * 6, 2.2 + rnd() * 2, 5 + rnd() * 4, cx + k * 4 - parts * 2, cy + rnd() * 1.5, cz + rnd() * 3, { lit: true });
    }
  }

  private dangerTex() {
    return canvasTex(256, 256, (g) => {
      const c = 128;
      const gr = g.createRadialGradient(c, c, 20, c, c, 124);
      gr.addColorStop(0, "rgba(255,60,90,0.15)");
      gr.addColorStop(0.75, "rgba(255,60,90,0.35)");
      gr.addColorStop(1, "rgba(255,60,90,0.6)");
      g.fillStyle = gr;
      g.beginPath();
      g.arc(c, c, 124, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#ff4466";
      g.lineWidth = 9;
      g.beginPath();
      g.arc(c, c, 118, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([20, 16]);
      g.strokeStyle = "rgba(255,255,255,0.85)";
      g.lineWidth = 6;
      g.beginPath();
      g.arc(c, c, 100, 0, Math.PI * 2);
      g.stroke();
    });
  }

  // ---- the parcels -------------------------------------------------------------------------------

  private blank(): Parcel {
    return { on: false, kind: 0, big: false, fee: 1, w: W65, s: S65, st: GONE, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, g: GRAV, ry: 0, rx: 0, rz: 0, spin: 0, seat: -1, thrown: false, pickAt: 0, lx: 0, lz: 0, wet: false, sx: 0, sy: 0, sz: 0, fx: 0, fy: 0, fz: 0, k: 1, born: 0, restAt: 0, goneT: 0 };
  }

  private alloc(): Parcel | null {
    for (const p of this.parcels)
      if (!p.on) {
        p.on = true;
        p.g = GRAV;
        p.thrown = false;
        p.seat = -1;
        p.pickAt = 0;
        p.k = 1;
        p.rx = p.rz = 0;
        p.spin = 0;
        p.born = this.clk;
        p.goneT = 0;
        p.ry = this.rnd() * Math.PI * 2;
        return p;
      }
    return null;
  }

  /** Its kind, size and fee. */
  private roll(p: Parcel, kind: number, big: boolean) {
    const r = this.rnd;
    p.kind = kind;
    p.big = big;
    p.w = big ? W87 : W65;
    p.s = big ? S87 : S65;
    // transparent: 2–6 (an Orchard-sized one 3–8); shielded: 2–7 (4–9)
    p.fee = kind === 0 ? (big ? 3 + Math.floor(r() * 6) : 2 + Math.floor(r() * 5)) : big ? 4 + Math.floor(r() * 6) : 2 + Math.floor(r() * 6);
  }

  /** What it pays this block (shielded doubles in the Shielded Hour). */
  private eff(p: Parcel) {
    return p.kind === 1 && this.makers ? p.fee * 2 : p.fee;
  }

  /** A free spot for a parcel shot from (px, pz): into p.lx, p.lz. */
  private spot(px: number, pz: number, p: Parcel) {
    const rnd = this.rnd;
    const base = Math.atan2(-px, -pz);
    let bx = 0,
      bz = 0,
      bs = -1;
    for (let k = 0; k < 18; k++) {
      const a = base + (rnd() - 0.5) * 2.3;
      const d = 2.0 + rnd() * 5.2;
      const x = px + Math.sin(a) * d,
        z = pz + Math.cos(a) * d;
      if (Math.abs(x) > this.xw - 0.9 || Math.abs(z) > this.zd - 0.9) continue;
      let m = 9;
      for (const c of this.crates) m = Math.min(m, Math.max(Math.abs(x - c.x), Math.abs(z - c.z)) - CH - 1.0);
      for (const q of this.parcels) if (q.on && q !== p && (q.st === REST || q.st === FLY)) m = Math.min(m, Math.hypot((q.st === REST ? q.x : q.lx) - x, (q.st === REST ? q.z : q.lz) - z) - 1.0);
      if (this.whale && this.whale.kind === 2 && this.whale.st === FLY) m = Math.min(m, Math.hypot(this.whale.lx - x, this.whale.lz - z) - 2.6);
      if (m > bs) ((bs = m), (bx = x), (bz = z));
      if (m > 0.6) break;
    }
    p.lx = bx;
    p.lz = bz;
  }

  /** On its way from (x, y, z) to land at (lx, lz) in `tf` seconds. */
  private launchTo(p: Parcel, x: number, y: number, z: number, tf: number) {
    p.st = FLY;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = (p.lx - x) / tf;
    p.vz = (p.lz - z) / tf;
    p.vy = (p.s / 2 - y + 0.5 * p.g * tf * tf) / tf;
    p.spin = (this.rnd() - 0.5) * 9;
  }

  private spawn() {
    const rnd = this.rnd;
    // a pad flares, then shoots
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const q = this.pending[i];
      if (this.t < q.at) continue;
      this.pending[i] = this.pending[this.pending.length - 1];
      this.pending.pop();
      const p = this.alloc();
      if (!p) continue;
      p.kind = q.kind;
      p.big = q.big;
      p.w = q.big ? W87 : W65;
      p.s = q.big ? S87 : S65;
      p.fee = q.fee;
      const [px, pz] = this.L.pads[q.pad];
      this.spot(px, pz, p);
      this.launchTo(p, px, 0.5, pz, 0.62 + Math.hypot(p.lx - px, p.lz - pz) * 0.045);
      this.fx.burst(this.v.set(px, 0.4, pz), 10, [KIND_C[p.kind], "#ffffff", "#7fe0ff"], { speed: 3, up: 6, size: 0.15, life: 0.5, gravity: 10 });
      this.ringFx(px, 0.15, pz, 0.6, 1.8, 0.35, KIND_C[p.kind], 0.8);
      beep(p.kind ? 700 : 520, 0.09, "triangle", 0.12, 1.8);
    }
    if (this.t < this.spawnAt) return;
    const b = this.blk;
    this.spawnAt = this.t + [0.66, 0.6, 0.56, 0.42][b] * (0.75 + rnd() * 0.5);
    let n = 0;
    for (const p of this.parcels) if (p.on && p.kind !== 2 && (p.st === REST || p.st === FLY)) n++;
    n += this.pending.length;
    if (n >= [10, 11, 12, 13][b]) {
      // the mempool is full: the stalest cheap one is evicted to make room
      let worst: Parcel | null = null,
        wv = Infinity;
      for (const p of this.parcels) {
        if (!p.on || p.st !== REST || p.kind === 2 || this.t - p.restAt < 7) continue;
        if (this.run.some((r) => r.tgt === p)) continue;
        const v = p.fee / p.w - (this.t - p.restAt) * 0.02;
        if (v < wv) ((wv = v), (worst = p));
      }
      if (!worst) return;
      this.evict(worst);
    }
    const pad = (this.padNext + (rnd() < 0.35 ? 1 : 0)) % 4;
    this.padNext = pad + 1;
    const kind = rnd() < (this.makers ? 0.6 : 0.42) ? 1 : 0;
    const big = rnd() < 0.36;
    const fee = kind === 0 ? (big ? 3 + Math.floor(rnd() * 6) : 2 + Math.floor(rnd() * 5)) : big ? 4 + Math.floor(rnd() * 6) : 2 + Math.floor(rnd() * 6);
    this.pending.push({ pad, at: this.t + 0.42, kind, big, fee });
    this.padGlow[pad] = 1;
  }

  private evict(p: Parcel) {
    this.stats.evicted++;
    p.st = GONE;
    p.goneT = 0;
    this.fx.burst(this.v.set(p.x, p.y, p.z), 8, ["#8a87a8", "#ffffff"], { speed: 2, up: 2.5, size: 0.14, life: 0.5, gravity: -1, drag: 2 });
  }

  // ---- the clockwork: blocks, the whale, the Shielded Hour, the seal --------------------------------

  /** The level's moving parts: the barges drift the crates up and down the quay, the belts turn round after a klaxon. */
  private drift(dt: number) {
    const L = this.L;
    if (L.barge) {
      const b = L.barge;
      for (const c of this.crates) {
        const x = c.x0 + b.amp * Math.sin((Math.PI * 2 * this.t) / b.period + b.phase[c.seat] + this.bargePh);
        c.vx = dt > 0 ? (x - c.x) / dt : 0;
        c.x = x;
        c.g.position.x = x;
        c.beam.position.x = x;
        c.zone.position.x = x;
        if (c.items.length) this.layout(c);
      }
    }
    if (L.belts && this.phase === "play") {
      const left = this.flipAt - this.t;
      const w = clamp(1 - left / 1.2, 0, 1);
      if (w > 0 && this.warnB <= 0) {
        [740, 554, 740, 554].forEach((f, i) => beep(f, 0.14, "square", 0.12, 1, i * 0.16));
        if (this.flipsB++ < 3) this.say(T("BELTS TURNING!", "传送带要反转！"), "#ffb02e", 1.1, 34, 0, H * 0.62);
      }
      this.warnB = w;
      if (left <= 0) {
        this.beltDir = -this.beltDir;
        this.flipAt += L.belts.flip;
        this.warnB = 0;
        sfx.thud();
        this.cam.shake(0.1);
        // (sparks off the rollers as they grind round)
        for (const bz of L.belts.z) for (const sx of [-1, 1]) this.fx.burst(this.v.set(sx * (this.xw - 0.2), 0.3, bz), 12, ["#ffd27a", "#ffb02e", "#ffffff"], { speed: 5, up: 4, size: 0.13, life: 0.5, gravity: 14 });
      }
      const goal = this.beltDir * L.belts.v;
      this.beltV += (goal - this.beltV) * (1 - Math.exp(-3 * dt));
    }
  }

  private clockwork() {
    const len = BLOCKS[this.blk];
    if (this.blk === 1 && !this.whaleDone[0] && this.blkT >= 3.2) this.whaleCall(0);
    this.spawn();
    const left = len - this.blkT;
    const n = Math.ceil(left);
    if (n <= 3 && n > 0 && n !== this.lastTick) {
      this.lastTick = n;
      sfx.tick();
    }
    if (this.blkT >= len) this.seal();
  }

  private whaleCall(k: number) {
    this.whaleDone[k] = true;
    const p = this.alloc();
    if (!p) return;
    p.kind = 2;
    p.big = true;
    p.w = WHALE_W;
    p.s = S_WHALE;
    p.fee = WHALE_FEE;
    p.ry = 0.4;
    p.lx = (this.rnd() - 0.5) * 2.2;
    p.lz = (this.rnd() - 0.5) * 1.4;
    // from high up, to land in 2 s: its shadow and a red ring show where
    p.st = FLY;
    p.x = p.lx;
    p.z = p.lz;
    p.y = 22;
    p.vx = p.vz = p.vy = 0;
    p.g = ((22 - p.s / 2) * 2) / (2.0 * 2.0);
    p.spin = 0;
    this.whale = p;
    this.say(T("WHALE TX!", "巨鲸交易！"), "#59e6ff", 1.6, 64);
    this.say(T(`FEE ${WHALE_FEE} · ${WHALE_W} kB · WATCH THE SHADOW`, `手续费 ${WHALE_FEE} · ${WHALE_W} kB · 看影子`), "#ffffff", 1.7, 24, 0.15, H * 0.3 + 52);
    [392, 523, 659, 784].forEach((f, i) => beep(f, 0.22, "sawtooth", 0.16, 1, i * 0.09));
    this.cam.shake(0.12);
  }

  /** BLOCK FOUND!: every crate's lid slams shut, its fees score, the next block starts. */
  private seal() {
    const b = this.blk;
    for (const c of this.crates) {
      let fee = 0;
      for (const p of c.items) {
        fee += this.eff(p);
        if (p.kind === 2) this.stats.whale[c.seat]++;
      }
      c.blocks[b] = fee;
      c.sealedFee = fee;
      this.score[c.seat] += fee;
      c.count += c.items.length;
      c.sealT = 0;
      c.lidY = 5.2 + c.seat * 0.3;
      c.lidV = 0;
      c.landed = false;
      c.confirmed = false;
      let top = CRATE_H;
      for (const p of c.items) top = Math.max(top, p.sy + p.s / 2);
      c.lidRest = top + 0.13;
      c.stamp.material = this.stampMats[b];
      c.lid.visible = true;
      c.lid.scale.setScalar(1);
      c.thief = -1;
    }
    for (const r of this.run) if (r.snipeOn >= 0) ((r.snipeOn = -1), (r.snipe = 0));
    // the block's best builder hops for joy
    let best = 0;
    for (let i = 1; i < 4; i++) if (this.crates[i].blocks[b] > this.crates[best].blocks[b]) best = i;
    if (this.crates[best].blocks[b] > 0 && b < 3) {
      const r = this.run[best];
      r.a.cheer(1.2);
      if (r.stun <= 0) r.a.jump(7.5);
      this.pop(this.crates[best].x, 1.6, this.crates[best].z + CH + 0.6, T("BEST BLOCK!", "最佳区块！"), "#ffffff", true);
    }
    this.say(T(`BLOCK #${b + 1} FOUND!`, `区块 #${b + 1} 出块！`), "#ffffff", 1.4, 62);
    beep(1046, 0.1, "square", 0.25);
    beep(1568, 0.25, "square", 0.25, 0, 0.08);
    this.flash = 1;
    this.lastTick = -1;
    this.makers = false;
    if (b === 3) {
      const tie = this.crates.map((c) => Math.max(...c.blocks) * 100 + c.count);
      this.final = rankBy(this.score, tie);
      this.phase = "tally";
      this.tallyT = 0;
      this.pending.length = 0;
      music.rate(1);
      return;
    }
    this.blk++;
    this.blkT = 0;
    if (this.blk === 2) {
      this.makers = true;
      this.say(T("SHIELDED HOUR!", "屏蔽时刻！"), LILAC, 1.9, 64, 1.25);
      this.say(T("shielded (lilac) parcels pay ×2", "屏蔽（淡紫）包裹手续费 ×2"), "#ffffff", 1.8, 26, 1.45, H * 0.3 + 54);
      [523, 659, 784, 1046, 1318].forEach((f, i) => beep(f, 0.12, "triangle", 0.22, 0, 1.25 + i * 0.07));
    }
    if (this.blk === 3) {
      this.say(T("LAST BLOCK! FASTER!", "最后一个区块！加速！"), "#ff6b35", 1.9, 60, 1.25);
      // a rush of parcels to open it
      for (let k = 0; k < 4; k++) {
        const kind = this.rnd() < 0.45 ? 1 : 0,
          big = this.rnd() < 0.4;
        const fee = kind === 0 ? (big ? 3 + Math.floor(this.rnd() * 6) : 2 + Math.floor(this.rnd() * 5)) : big ? 4 + Math.floor(this.rnd() * 6) : 2 + Math.floor(this.rnd() * 6);
        this.pending.push({ pad: k, at: this.t + 1.0 + k * 0.15, kind, big, fee });
        this.padGlow[k] = 1;
      }
      music.rate(1.15);
      [660, 880, 1046].forEach((f, i) => beep(f, 0.12, "square", 0.2, 0, 1.25 + i * 0.1));
    }
  }

  private finish() {
    this.over = this.final;
    if (!this.over) return;
    const win = this.run[this.over[0]];
    win.a.cheer(3);
    win.a.jump(9);
    win.jumpAt = 0.9;
    this.run[this.over[3]].angryT = 9;
  }

  // ---- the phases --------------------------------------------------------------------------------

  /** The play camera: three-quarter, over the plaza, leaning a little toward you. */
  private playCam() {
    let hx = 0,
      hz = 0;
    if (this.human >= 0) {
      const p = this.run[this.human].a.pos;
      hx = clamp(p.x, -7, 7);
      hz = clamp(p.z, -5, 5);
    }
    this.eye.set(hx * 0.16, 16.5, 13.7 + hz * 0.1);
    this.at.set(hx * 0.22, 0, 0.95 + hz * 0.14);
  }

  idle(dt: number, phase: "card" | "count", k: number) {
    this.phase = phase;
    this.clk += dt;
    if (phase === "card") this.cam.orbit(this.v.set(0, 0, 0), -0.55 + k * 0.14, 24, 13);
    else {
      this.playCam();
      this.cam.to(this.eye, this.at, dt, 3.4);
    }
    this.cam.apply(dt);
    for (let i = 0; i < 4; i++) this.place(i, dt);
    this.tickParcels(dt);
    this.animate(dt);
    this.render();
  }

  update(dt: number, input: Input) {
    for (let k = 0; k < TURBO; k++) ((this.sub0 = k === 0), this.step(dt, input));
  }

  private step(dt: number, input: Input) {
    if (this.phase === "card" || this.phase === "count") this.phase = "play";
    this.clk += dt;
    if (this.over) this.post += dt;
    if (this.phase === "play") {
      this.t += dt;
      this.blkT += dt;
      this.drift(dt);
      this.clockwork();
    } else if (this.phase === "tally") {
      this.tallyT += dt;
      if (!this.over && this.tallyT >= TALLY) this.finish();
      // the winner's cheer as the tally crowns them
      if (this.final && this.tallyT >= 2.3 && this.tallyT - dt < 2.3) {
        const wr = this.run[this.final[0]];
        wr.a.cheer(3);
        wr.a.jump(8.5);
        wr.jumpAt = 0.8;
        if (this.final[0] === this.human) sfx.star();
        else beep(523, 0.2, "triangle", 0.2);
      }
    }
    const live = this.phase === "play";
    for (let i = 0; i < 4; i++) this.move(i, dt, input, live);
    // the bumps between them
    for (let i = 0; i < 4; i++)
      for (let j = i + 1; j < 4; j++) {
        const a = this.run[i].a.pos,
          b = this.run[j].a.pos;
        const dx = b.x - a.x,
          dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d < PR * 1.9 && d > 1e-4) {
          const push = (PR * 1.9 - d) / 2;
          a.x -= (dx / d) * push;
          a.z -= (dz / d) * push;
          b.x += (dx / d) * push;
          b.z += (dz / d) * push;
        }
      }
    for (let i = 0; i < 4; i++) this.place(i, dt);
    if (live) for (let i = 0; i < 4; i++) this.dunk(i);
    this.tickParcels(dt);
    this.tickCrates(dt);
    this.animate(dt);
    this.render();
    // the camera: the game's own; the tally a little higher; at the end, down on the winner
    if (this.over) {
      const p = this.run[this.over[0]].a.pos;
      // (the winner low in the frame: the FINISH! banner goes over the middle)
      this.eye.set(p.x * 0.8, 7.4, p.z + 8.8);
      this.at.set(p.x * 0.92, 3.0, p.z - 1.6);
      this.cam.to(this.eye, this.at, dt, 3.2, 5);
    } else if (this.phase === "tally") {
      this.eye.set(0, 18.4, 15.2);
      this.at.set(0, 0, 0.5);
      this.cam.to(this.eye, this.at, dt, 1.6);
    } else {
      this.playCam();
      this.cam.to(this.eye, this.at, dt, 2.6);
    }
    this.cam.apply(dt);
    for (let i = 0; i < 4; i++) {
      this.bump[i] = Math.max(0, this.bump[i] - dt * 2.6);
      this.loss[i] = Math.max(0, this.loss[i] - dt * 2.2);
    }
    this.flash = Math.max(0, this.flash - dt * 2.5);
    this.hurtFx = Math.max(0, this.hurtFx - dt * 1.8);
  }

  // ---- the players -------------------------------------------------------------------------------

  private move(i: number, dt: number, input: Input, live: boolean) {
    const r = this.run[i],
      a = r.a,
      P = r.p;
    r.cd -= dt;
    r.immune -= dt;
    r.bufA -= dt;
    r.bufB -= dt;
    let mx = 0,
      mz = 0,
      wantA = false,
      holdA = false,
      wantB = false,
      bdx = 0,
      bdz = 0;
    if (live && r.stun <= 0) {
      if (P.human) {
        const ax = input.axis();
        // screen-relative: "up" runs away from the camera
        let fx = this.cam.at.x - this.cam.eye.x,
          fz = this.cam.at.z - this.cam.eye.z;
        const fl = Math.hypot(fx, fz) || 1;
        ((fx /= fl), (fz /= fl));
        mx = -fz * ax.x - fx * ax.y;
        mz = fx * ax.x - fz * ax.y;
        const l = Math.hypot(mx, mz);
        if (l > 1) ((mx /= l), (mz /= l));
        if (this.sub0 && input.pressed("a")) r.bufA = 0.16;
        if (this.sub0 && input.pressed("b")) r.bufB = 0.16;
        wantA = r.bufA > 0;
        holdA = input.held("a");
        wantB = r.bufB > 0;
        if (l > 0.1) ((bdx = mx / l), (bdz = mz / l));
        else ((bdx = Math.sin(a.yaw)), (bdz = Math.cos(a.yaw)));
      } else {
        this.brain(i, dt);
        ((mx = this.mx), (mz = this.mz), (wantA = this.wantA), (holdA = this.holdA), (wantB = this.wantB), (bdx = this.bdx), (bdz = this.bdz));
      }
    }
    // the snipe: digging in a rival's crate (held A); a move or a let-go stops it
    if (r.snipeOn >= 0) {
      const c = this.crates[r.snipeOn];
      if (!live || r.stun > 0 || !holdA || c.sealT >= 0 || !c.items.length || this.boxDist(a.pos.x, a.pos.z, c) > PR + 0.6 || r.carry) {
        r.snipeOn = -1;
        r.snipe = 0;
        if (c.thief === i) c.thief = -1;
      } else {
        r.snipe += dt;
        c.thief = i;
        mx = mz = 0;
        wantA = false;
        a.face(yawOf(c.x - a.pos.x, c.z - a.pos.z), dt, 10);
        if (Math.random() < dt * 20) this.fx.burst(this.v.set(c.x + (a.pos.x - c.x) * 0.45, CRATE_H + 0.2, c.z + (a.pos.z - c.z) * 0.45), 1, ["#ff4466", "#ffffff", this.players[c.seat].color], { speed: 2.5, up: 3, size: 0.12, life: 0.4 });
        if (r.snipe >= SNIPE) this.steal(i, c);
      }
    }
    if (r.stun > 0) {
      r.stun -= dt;
      const k = Math.exp(-(a.grounded ? 5 : 0.4) * dt);
      r.vx *= k;
      r.vz *= k;
      if (r.stun <= 0) ((r.immune = IMMUNE), (r.spin = 0));
    } else if (r.dash > 0) {
      r.dash -= dt;
      if (r.dash <= 0) r.rec = RECOVER;
      for (let j = 0; j < 4; j++) {
        if (j === i) continue;
        const o = this.run[j];
        if (o.stun > 0 || o.immune > 0) continue;
        if (Math.hypot(o.a.pos.x - a.pos.x, o.a.pos.z - a.pos.z) < 1.05 && Math.abs(o.a.pos.y - a.pos.y) < 1.2) {
          this.tackle(i, j);
          break;
        }
      }
    } else {
      if (wantA && live) this.act(i, holdA, bdx, bdz);
      else if (holdA && live && !r.carry && r.snipeOn < 0 && a.grounded) this.trySnipe(i);
      if (wantB && live && !r.carry && r.cd <= 0 && a.grounded && r.snipeOn < 0) {
        r.bufB = 0;
        r.dash = DASH_T;
        r.cd = DASH_CD;
        r.dx = bdx;
        r.dz = bdz;
        r.vx = bdx * DASH_V;
        r.vz = bdz * DASH_V;
        a.yaw = yawOf(bdx, bdz);
        a.vy = 3.2;
        a.grounded = false;
        this.fx.burst(this.v.set(a.pos.x, 0.15, a.pos.z), 8, ["#ffffff", "#a8d8e8"], { speed: 2.5, up: 1.2, size: 0.16, gravity: 4, life: 0.4, drag: 3 });
        if (P.human) sfx.whoosh();
      } else if (r.snipeOn < 0) {
        const load = r.carry ? LOAD[r.carry.kind === 2 ? 2 : r.carry.big ? 1 : 0] : 1;
        const ai = P.human ? 1 : aiPace(P.skill);
        const sp = SPEED * load * ai * (r.rec > 0 ? 0.4 : 1);
        const k = 1 - Math.exp(-14 * dt);
        r.vx += (mx * sp - r.vx) * k;
        r.vz += (mz * sp - r.vz) * k;
      } else {
        r.vx *= Math.exp(-14 * dt);
        r.vz *= Math.exp(-14 * dt);
      }
      r.rec -= dt;
    }
    a.pos.x += r.vx * dt;
    a.pos.z += r.vz * dt;
    if (this.L.belts && a.grounded) a.pos.x += this.beltAt(a.pos.z) * dt;
  }

  /** A: throw what you carry, pick up what is near, or start lifting a parcel out of a rival's crate. */
  private act(i: number, holdA: boolean, dx: number, dz: number) {
    const r = this.run[i];
    r.bufA = 0;
    if (r.carry) {
      // at your own crate: in it goes
      if (this.boxDist(r.a.pos.x, r.a.pos.z, this.crates[i]) < PR + 0.4) {
        if (this.dunk(i, true)) return;
      }
      this.throwIt(i, dx, dz);
      return;
    }
    const p = this.reach(i);
    if (p) {
      this.pick(i, p);
      return;
    }
    if (holdA) this.trySnipe(i);
  }

  /** At a rival's crate with empty hands: start digging in it. */
  private trySnipe(i: number) {
    const r = this.run[i];
    for (const c of this.crates) {
      if (c.seat === i || c.sealT >= 0 || !c.items.length) continue;
      if (this.boxDist(r.a.pos.x, r.a.pos.z, c) < PR + 0.5) {
        r.snipeOn = c.seat;
        r.snipe = 0;
        c.thief = i;
        c.alarmT = 0;
        r.vx = r.vz = 0;
        if (c.seat === this.human) {
          this.say(T("THIEF AT YOUR CRATE!", "有人偷你的箱子！"), "#ff4466", 1.3, 34, 0, H * 0.62);
          this.hurtFx = 0.8;
        }
        beep(880, 0.08, "square", 0.18);
        return;
      }
    }
  }

  /** The nearest parcel on the floor in reach (a little ahead is preferred). */
  private reach(i: number) {
    const r = this.run[i],
      a = r.a;
    const fx = Math.sin(a.yaw),
      fz = Math.cos(a.yaw);
    let best: Parcel | null = null,
      bs = Infinity;
    for (const p of this.parcels) {
      if (!p.on || p.st !== REST || this.t < p.pickAt) continue;
      const dx = p.x - a.pos.x,
        dz = p.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > PICK_R + p.s * 0.5) continue;
      const sc = d - ((dx * fx + dz * fz) / Math.max(d, 0.01)) * 0.35;
      if (sc < bs) ((bs = sc), (best = p));
    }
    return best;
  }

  private pick(i: number, p: Parcel) {
    const r = this.run[i];
    this.stats.picks[i]++;
    p.st = CARRY;
    p.seat = i;
    p.k = 0;
    p.fx = p.x;
    p.fy = p.y;
    p.fz = p.z;
    p.thrown = false;
    r.carry = p;
    r.throwPlan = !r.p.human && p.kind !== 2 && this.rnd() < (r.p.skill - 0.45) * 1.2;
    if (!r.p.human) r.rec = (1 - r.p.skill) * 0.35 * (0.5 + this.rnd());
    r.sq = 1;
    this.fx.burst(this.v.set(p.x, p.y + 0.2, p.z), 10, [KIND_C[p.kind], "#ffffff"], { speed: 3, up: 4, size: 0.14, life: 0.45 });
    if (r.p.human) {
      sfx.blip(p.kind === 2 ? 6 : 3);
      if (p.kind === 2) beep(330, 0.2, "sawtooth", 0.2, 0.6);
    }
    if (p.kind === 2) this.pop(p.x, 2.6, p.z, T("WHALE!", "巨鲸！"), "#59e6ff", true);
  }

  private throwIt(i: number, dx: number, dz: number) {
    const r = this.run[i],
      a = r.a,
      p = r.carry!;
    r.carry = null;
    p.st = FLY;
    p.seat = i;
    p.g = GRAV;
    p.x = a.pos.x + dx * 0.3;
    p.z = a.pos.z + dz * 0.3;
    p.y = a.pos.y + HOLD_Y + p.s / 2;
    const moving = Math.hypot(r.vx, r.vz) > 1.2;
    if (p.kind === 2) {
      // the whale is too heavy to throw: it is set down in front
      p.vx = dx * 2.2;
      p.vz = dz * 2.2;
      p.vy = 2;
      p.thrown = false;
    } else if (!moving) {
      // standing: a little toss in front
      p.vx = dx * 3.4;
      p.vz = dz * 3.4;
      p.vy = 4.5;
      p.thrown = false;
    } else {
      p.vx = dx * THROW_V;
      p.vz = dz * THROW_V;
      p.vy = THROW_UP;
      p.thrown = true;
      // a throw that would land near your own crate is helped in
      const c = this.crates[i];
      const yl = CRATE_H + p.s / 2;
      const tl = (p.vy + Math.sqrt(p.vy * p.vy + 2 * p.g * Math.max(0, p.y - yl))) / p.g;
      const lx = p.x + p.vx * tl,
        lz = p.z + p.vz * tl;
      const cx = c.x + c.vx * tl;
      if (Math.hypot(lx - cx, lz - c.z) < 2.3) {
        p.vx = (cx - p.x) / tl;
        p.vz = (c.z - p.z) / tl;
      }
    }
    p.pickAt = this.t + 0.3;
    p.spin = (this.rnd() - 0.5) * 12;
    this.predict(p);
    r.sq = 0.6;
    if (r.p.human) sfx.whoosh();
  }

  /** Where a flying parcel will come down (for the AI and the shadow). */
  private predict(p: Parcel) {
    const yl = p.s / 2;
    const tl = (p.vy + Math.sqrt(p.vy * p.vy + 2 * p.g * Math.max(0, p.y - yl))) / p.g;
    p.lx = clamp(p.x + p.vx * tl, -this.xw + p.s / 2, this.xw - p.s / 2);
    if (this.L.water) {
      p.lz = p.z + p.vz * tl;
      p.wet = Math.abs(p.lz) > this.zd;
    } else {
      p.lz = clamp(p.z + p.vz * tl, -this.zd + p.s / 2, this.zd - p.s / 2);
      p.wet = false;
    }
  }

  /** Into your own crate when you touch it (or press A at it). False: not now (full, sealed). */
  private dunk(i: number, pressed = false) {
    const r = this.run[i];
    const p = r.carry;
    if (!p || r.stun > 0) return false;
    const c = this.crates[i];
    if (this.boxDist(r.a.pos.x, r.a.pos.z, c) > PR + (pressed ? 0.45 : 0.3)) return false;
    if (c.sealT >= 0 && !c.confirmed) {
      if (c.fullT <= 0 && r.p.human) ((c.fullT = 1.2), this.pop(c.x, 2.4, c.z, T("SEALING…", "封块中…"), "#ffffff", false));
      return false;
    }
    if (c.w + p.w > CAP) {
      if (c.fullT <= 0) {
        c.fullT = 1.2;
        this.pop(c.x, 2.4, c.z, T("FULL!", "满了！"), "#ff4466", true);
        if (r.p.human) sfx.lose();
      }
      return false;
    }
    r.carry = null;
    this.into(c, p, r.a.pos.x, r.a.pos.y + HOLD_Y + p.s / 2, r.a.pos.z);
    return true;
  }

  /** A parcel goes into a crate (dunked or thrown in). */
  private into(c: Crate, p: Parcel, fx: number, fy: number, fz: number) {
    p.st = IN;
    p.seat = c.seat;
    p.thrown = false;
    p.fx = fx;
    p.fy = fy;
    p.fz = fz;
    p.k = 0;
    c.items.push(p);
    c.w += p.w;
    this.layout(c);
    c.bump = 1;
    const v = this.eff(p);
    const col = this.players[c.seat].color;
    if (p.kind === 2) {
      const o = this.run[c.seat];
      o.a.cheer(1.5);
      this.cam.shake(0.2);
      this.ringFx(c.x, 0.1, c.z, 1, 4, 0.5, "#59e6ff", 1);
    }
    this.pop(c.x, 2.3, c.z, `+${v}`, p.kind === 1 && this.makers ? LILAC : "#ffffff", v >= 8);
    this.fx.burst(this.v.set(c.x, CRATE_H + 0.3, c.z), 16, [col, KIND_C[p.kind], "#ffffff"], { speed: 4.5, up: 5, size: 0.17, life: 0.6 });
    this.ringFx(c.x, CRATE_H + 0.05, c.z, 0.8, 2.2, 0.3, col, 0.8);
    if (c.seat === this.human) {
      sfx.coin();
      if (CAP - c.w < W65) this.pop(c.x, 3.1, c.z, T("BLOCK FULL", "区块已满"), "#8ee35b", false);
    }
  }

  /** The crate's parcels in their spots: four on the floor of it, the whale under the rest. */
  private layout(c: Crate) {
    const whale = c.items.find((p) => p.kind === 2);
    let k = 0;
    for (const p of c.items) {
      if (p === whale) {
        p.sx = c.x;
        p.sz = c.z;
        p.sy = 0.14 + p.s / 2;
        continue;
      }
      const col = k % 4,
        layer = Math.floor(k / 4) + (whale ? 1 : 0);
      const ox = col % 2 ? 0.5 : -0.5,
        oz = col < 2 ? -0.5 : 0.5;
      p.sx = c.x + ox;
      p.sz = c.z + oz;
      p.sy = (whale ? 0.14 + S_WHALE : 0.14) + p.s / 2 + (layer - (whale ? 1 : 0)) * 0.98;
      k++;
    }
  }

  /** The snipe done: the best parcel lifted out of the rival's crate. */
  private steal(i: number, c: Crate) {
    const r = this.run[i];
    let best: Parcel | null = null;
    for (const p of c.items) if (!best || this.eff(p) > this.eff(best)) best = p;
    r.snipeOn = -1;
    r.snipe = 0;
    c.thief = -1;
    if (!best) return;
    this.stats.steals[i]++;
    c.items.splice(c.items.indexOf(best), 1);
    c.w -= best.w;
    this.layout(c);
    best.st = CARRY;
    best.seat = i;
    best.k = 0;
    best.fx = best.x;
    best.fy = best.y;
    best.fz = best.z;
    r.carry = best;
    r.throwPlan = false;
    r.sq = 1;
    this.loss[c.seat] = 1;
    this.pop(c.x, 2.6, c.z, T(`STOLEN −${this.eff(best)}`, `被偷 −${this.eff(best)}`), "#ff4466", true);
    this.fx.burst(this.v.set(c.x, CRATE_H + 0.5, c.z), 18, ["#ff4466", "#ffffff", KIND_C[best.kind]], { speed: 5, up: 5, size: 0.18, life: 0.6 });
    this.cam.shake(0.15);
    if (c.seat === this.human) ((this.hurtFx = 1), sfx.lose());
    if (i === this.human) sfx.star();
    if (!this.players[c.seat].human) this.run[c.seat].angryT = 2.5;
  }

  private tackle(i: number, j: number) {
    this.stats.tackles[i]++;
    const r = this.run[i],
      o = this.run[j];
    o.stun = STUN;
    o.dash = 0;
    o.rec = 0;
    o.vx = r.dx * 7.5;
    o.vz = r.dz * 7.5;
    o.spin = 7 * (this.rnd() < 0.5 ? -1 : 1);
    o.a.vy = 5;
    o.a.grounded = false;
    o.a.hit();
    o.angryT = 2;
    o.hurt = 1;
    r.vx *= 0.2;
    r.vz *= 0.2;
    r.dash = 0;
    r.rec = 0.3;
    const mx = (r.a.pos.x + o.a.pos.x) / 2,
      mz = (r.a.pos.z + o.a.pos.z) / 2;
    this.fx.burst(this.v.set(mx, 1.0, mz), 18, ["#ffffff", "#ffe14a", this.players[j].color], { speed: 6, up: 3, size: 0.2, life: 0.55, gravity: 10 });
    this.ringFx(mx, 1.0, mz, 0.3, 1.7, 0.3, "#ffffff", 0.9);
    sfx.hit();
    this.cam.shake(i === this.human || j === this.human ? 0.32 : 0.14);
    if (j === this.human) this.hurtFx = 0.7;
    if (o.snipeOn >= 0) {
      this.crates[o.snipeOn].thief = -1;
      o.snipeOn = -1;
      o.snipe = 0;
    }
    if (o.carry) this.drop(j, r.dx, r.dz, true);
  }

  /** Whoever carries something lets go of it: it flies off. */
  private drop(j: number, dx: number, dz: number, loud: boolean) {
    const o = this.run[j];
    const p = o.carry!;
    o.carry = null;
    p.st = FLY;
    p.seat = -1;
    p.thrown = false;
    p.g = GRAV;
    p.x = o.a.pos.x;
    p.z = o.a.pos.z;
    p.y = o.a.pos.y + HOLD_Y + p.s / 2;
    const an = Math.atan2(dx, dz) + (this.rnd() - 0.5) * 1.6;
    const sp = p.kind === 2 ? 1.6 : 3.2;
    p.vx = Math.sin(an) * sp;
    p.vz = Math.cos(an) * sp;
    p.vy = p.kind === 2 ? 3 : 7;
    p.spin = (this.rnd() - 0.5) * 12;
    p.pickAt = this.t + 0.35;
    this.predict(p);
    if (loud) {
      this.pop(o.a.pos.x, 3.0, o.a.pos.z, T("DROPPED!", "掉了！"), "#ff8a3c", false);
      this.loss[j] = 1;
    }
  }

  /** The distance from (x, z) to a crate's walls (0 inside). */
  private boxDist(x: number, z: number, c: Crate) {
    const dx = Math.max(0, Math.abs(x - c.x) - CH),
      dz = Math.max(0, Math.abs(z - c.z) - CH);
    return Math.hypot(dx, dz);
  }

  /** The rails, the crates, the floor; the pose. */
  private place(i: number, dt: number) {
    const r = this.run[i],
      a = r.a,
      p = a.pos;
    const lx = this.xw - PR,
      lz = this.zd - PR;
    if (p.x > lx) ((p.x = lx), r.vx > 0 && (r.vx *= -0.3));
    if (p.x < -lx) ((p.x = -lx), r.vx < 0 && (r.vx *= -0.3));
    if (p.z > lz) ((p.z = lz), r.vz > 0 && (r.vz *= -0.3));
    if (p.z < -lz) ((p.z = -lz), r.vz < 0 && (r.vz *= -0.3));
    for (const c of this.crates) {
      const ox = p.x - c.x,
        oz = p.z - c.z;
      const cx = clamp(ox, -CH, CH),
        cz = clamp(oz, -CH, CH);
      let dx = ox - cx,
        dz = oz - cz;
      let d = Math.hypot(dx, dz);
      if (d >= PR) continue;
      if (d < 1e-4) {
        const px = CH - Math.abs(ox),
          pz = CH - Math.abs(oz);
        if (px < pz) ((dx = Math.sign(ox) || 1), (dz = 0), (p.x = c.x + dx * (CH + PR)));
        else ((dx = 0), (dz = Math.sign(oz) || 1), (p.z = c.z + dz * (CH + PR)));
        d = 1;
      } else {
        p.x = c.x + cx + (dx / d) * PR;
        p.z = c.z + cz + (dz / d) * PR;
      }
      const nx = dx / d,
        nz = dz / d;
      const vn = r.vx * nx + r.vz * nz;
      if (vn < 0) ((r.vx -= vn * nx * 1.1), (r.vz -= vn * nz * 1.1));
    }
    a.physics(dt, 0);
    if (this.over && i === this.over[0]) {
      r.jumpAt -= dt;
      if (r.jumpAt <= 0 && a.grounded) ((r.jumpAt = 0.75), a.jump(8.5));
    }
    const sp = Math.hypot(r.vx, r.vz);
    if (r.stun > 0) {
      a.yaw += r.spin * dt;
      r.spin *= Math.exp(-2.5 * dt);
    } else if (sp > 0.6 && r.snipeOn < 0) a.face(yawOf(r.vx, r.vz), dt, r.dash > 0 ? 30 : 15);
    a.legs = r.stun > 0 || r.snipeOn >= 0 ? 0 : null;
    r.angryT -= dt;
    r.hurt = Math.max(0, r.hurt - dt * 2);
    a.angry = r.angryT > 0;
    const lean = r.dash > 0 ? 0.75 : r.rec > 0 ? 0.4 : r.snipeOn >= 0 ? 0.45 : 0;
    r.lean += (lean - r.lean) * Math.min(1, 20 * dt);
    a.body.root.rotation.x = r.lean;
    r.sq = Math.max(0, r.sq - dt * 6);
    const q = Math.sin(r.sq * Math.PI) * 0.16;
    a.body.root.scale.set(SIZE * (1 + q), SIZE * (1 - q * 0.8), SIZE * (1 + q));
    a.sync(dt, this.clk);
    // the arms: up under a parcel, digging at a crate, or the body's own
    const b = a.body;
    const holding = !!r.carry && r.stun <= 0;
    const digging = r.snipeOn >= 0;
    b.holdArms(holding || digging);
    if (holding) {
      const bob = Math.sin(this.clk * 12 + i) * 0.07;
      b.armR.rotation.set(-2.9 + bob, 0, -0.3);
      b.armL.rotation.set(-2.9 - bob, 0, 0.3);
      b.foreArmR.rotation.set(-0.45, 0, 0);
      b.foreArmL.rotation.set(-0.45, 0, 0);
    } else if (digging) {
      const w = Math.sin(this.clk * 20 + i);
      b.armR.rotation.set(-1.3 + w * 0.55, 0, 0.2);
      b.armL.rotation.set(-1.3 - w * 0.55, 0, -0.2);
      b.foreArmR.rotation.set(-0.5, 0, 0);
      b.foreArmL.rotation.set(-0.5, 0, 0);
    }
    if (a.marker) a.marker.visible = !holding;
    if (r.hurt > 0) b.puppet.motion.expr = 7;
    else if (digging) b.puppet.motion.expr = 4;
    r.stars.visible = r.stun > 0;
    if (r.stun > 0) {
      r.stars.position.set(p.x, p.y + 1.95 * SIZE, p.z);
      r.stars.rotation.y += dt * 7;
    }
    b.root.visible = !(r.immune > 0 && Math.floor(this.clk * 15) % 3 === 0);
  }

  // ---- the AI ------------------------------------------------------------------------------------

  private brain(i: number, dt: number) {
    const r = this.run[i],
      sk = r.p.skill,
      me = r.a.pos;
    this.mx = this.mz = 0;
    this.wantA = this.holdA = this.wantB = false;
    this.bdx = Math.sin(r.a.yaw);
    this.bdz = Math.cos(r.a.yaw);
    r.think -= dt;
    // the plan gone stale: think again soon
    if (r.goal === G_FETCH && (!r.tgt || !r.tgt.on || (r.tgt.st !== REST && r.tgt.st !== FLY))) r.think = Math.min(r.think, 0.06 + (1 - sk) * 0.3);
    if (r.goal === G_SHOVE) {
      const o = this.run[r.tgtSeat];
      if (!o.carry && this.crates[i].thief !== r.tgtSeat) r.think = Math.min(r.think, 0.1);
    }
    if (r.goal === G_CRATE && !r.carry) r.think = Math.min(r.think, 0.05);
    if (r.carry && r.goal !== G_CRATE) r.think = 0;
    if (r.think <= 0) {
      r.think = lerp(0.6, 0.2, sk) * (0.75 + this.rnd() * 0.5);
      this.plan(i);
    }
    const c = this.crates[i];
    switch (r.goal) {
      case G_CRATE: {
        const p = r.carry;
        if (!p) break;
        const d = Math.hypot(c.x - me.x, c.z - me.z);
        const sealing = c.sealT >= 0 && !c.confirmed;
        const noRoom = c.w + p.w > CAP;
        if (sealing || noRoom) {
          // wait by it for the lid to lift (or, with no room left and long to go, let it go)
          if (noRoom && !sealing && BLOCKS[this.blk] - this.blkT > 3.5 && this.rnd() < dt * 1.5) {
            this.wantA = true;
            this.bdx = -c.x / (Math.hypot(c.x, c.z) || 1);
            this.bdz = -c.z / (Math.hypot(c.x, c.z) || 1);
            break;
          }
          const k = 2.6 / Math.max(d, 0.01);
          if (d > 2.9) this.steer(i, c.x + (me.x - c.x) * k, c.z + (me.z - c.z) * k, 1, i);
          break;
        }
        this.steer(i, c.x + c.vx * 0.5 * sk, c.z, 1, i);
        // a pro throws from the right range
        if (r.throwPlan && d > 4.6 && d < 6.1 && Math.hypot(r.vx, r.vz) > 2) {
          const want = Math.atan2(c.x - me.x, c.z - me.z);
          const err = Math.abs(Math.atan2(Math.sin(want - r.a.yaw), Math.cos(want - r.a.yaw)));
          if (err < 0.22) {
            this.wantA = true;
            this.bdx = Math.sin(want);
            this.bdz = Math.cos(want);
            r.throwPlan = false;
          }
        }
        break;
      }
      case G_FETCH: {
        const p = r.tgt;
        if (!p || !p.on) break;
        let tx = p.st === FLY ? p.lx : p.x,
          tz = p.st === FLY ? p.lz : p.z;
        // (riding a belt: meet it where it will be)
        if (p.st === REST && this.L.belts) tx += this.beltAt(p.z) * Math.min(1.5, Math.hypot(p.x - me.x, p.z - me.z) / (SPEED * 0.9)) * (0.4 + 0.5 * sk);
        // the whale still falling: a pro waits at the edge of its shadow, a greedy one right under it
        if (p.kind === 2 && p.st === FLY && p.y > 4) {
          const dx = me.x - tx,
            dz = me.z - tz;
          const d = Math.hypot(dx, dz) || 1;
          const rim = 2.7 * clamp(sk * 1.4 - (r.greed - 1) * 0.6, 0, 1);
          tx += (dx / d) * rim;
          tz += (dz / d) * rim;
        }
        this.steer(i, tx, tz, 1, -1);
        if (p.st === REST && Math.hypot(p.x - me.x, p.z - me.z) < PICK_R * 0.8 + p.s * 0.4) this.wantA = true;
        break;
      }
      case G_SHOVE: {
        const o = this.run[r.tgtSeat];
        const lead = clamp(Math.hypot(o.a.pos.x - me.x, o.a.pos.z - me.z) / 14, 0, 0.35) * sk;
        const tx = o.a.pos.x + o.vx * lead,
          tz = o.a.pos.z + o.vz * lead;
        const d = Math.hypot(tx - me.x, tz - me.z);
        this.steer(i, tx, tz, 1, -1);
        if (d < 2.3 && r.cd <= 0 && o.immune <= 0 && o.stun <= 0) {
          const an = Math.atan2(tx - me.x, tz - me.z) + (this.rnd() - 0.5) * (1 - sk) * 0.7;
          this.wantB = true;
          this.bdx = Math.sin(an);
          this.bdz = Math.cos(an);
          r.think = Math.min(r.think, 0.3);
        }
        break;
      }
      case G_SNIPE: {
        const t = this.crates[r.tgtSeat];
        const owner = this.run[r.tgtSeat].a.pos;
        // its owner coming back: a careful one gives up
        if (r.snipeOn >= 0 && Math.hypot(owner.x - t.x, owner.z - t.z) < 3.0 && this.rnd() < dt * sk * 3) {
          r.goal = G_IDLE;
          r.think = 0.2;
          break;
        }
        const dx = me.x - t.x,
          dz = me.z - t.z;
        const d = Math.hypot(dx, dz) || 1;
        if (this.boxDist(me.x, me.z, t) < PR + 0.4) {
          this.wantA = r.snipeOn < 0;
          this.holdA = true;
        } else this.steer(i, t.x + (dx / d) * (CH + 0.5), t.z + (dz / d) * (CH + 0.5), 1, t.seat);
        break;
      }
      default: {
        r.wander -= dt;
        if (r.wander <= 0) {
          r.wander = 1 + this.rnd() * 1.5;
          // by its crate when full (a guard), else toward a pad about to shoot
          if (CAP - c.w < W65) ((r.tx = c.x * 0.7), (r.tz = c.z * 0.55));
          else {
            const pd = this.L.pads[Math.floor(this.rnd() * 4)];
            r.tx = pd[0] * 0.6;
            r.tz = pd[1] * 0.6;
          }
        }
        if (Math.hypot(r.tx - me.x, r.tz - me.z) > 0.8) this.steer(i, r.tx, r.tz, 0.6, -1);
      }
    }
  }

  /** What next: a parcel to fetch, a carrier to shove, a crate to lift from, or to wait. */
  private plan(i: number) {
    const r = this.run[i],
      sk = r.p.skill,
      c = this.crates[i],
      rnd = this.rnd,
      me = r.a.pos;
    const room = CAP - c.w;
    const sp = SPEED * aiPace(sk);
    if (r.carry) {
      r.goal = G_CRATE;
      return;
    }
    // a thief at my crate: go get them
    if (c.thief >= 0 && c.thief !== i && rnd() < 0.3 + sk * 0.65) {
      r.goal = G_SHOVE;
      r.tgtSeat = c.thief;
      return;
    }
    let bv = 0.04,
      goal = G_IDLE,
      tgt: Parcel | null = null,
      seat = -1;
    const left = BLOCKS[this.blk] - this.blkT;
    // the parcels: fee per kB over the time to fetch and carry it
    for (const p of this.parcels) {
      if (!p.on || (p.st !== REST && p.st !== FLY) || (p.st === FLY && p.thrown && p.seat === i)) continue;
      if (p.st === FLY && p.wet) continue;
      const careless = rnd() < (1 - sk) * 0.08;
      if (p.w > room && !careless) continue;
      const px = p.st === FLY ? p.lx : p.x,
        pz = p.st === FLY ? p.lz : p.z;
      const d1 = Math.hypot(px - me.x, pz - me.z);
      const d2 = Math.hypot(px - c.x, pz - c.z) - CH;
      const eta = d1 / sp + d2 / (sp * 0.88) + 0.5;
      let v = this.eff(p) / Math.pow(p.w / W65, 0.3 + 0.9 * sk) / eta;
      // (on a belt: gone into the furnace before it gets there? a pro knows)
      if (p.st === REST && this.L.belts) {
        const bv = this.beltAt(p.z);
        if (bv && (this.xw - 0.55 - Math.sign(bv) * p.x) / Math.abs(bv) < d1 / sp + 0.2) v *= lerp(0.6, 0.05, sk);
      }
      // the block may close before it gets there: no matter (it waits), unless the lid is long to lift
      if (eta > left + SEAL + 1) v *= 0.85;
      // somebody nearer, empty-handed: a pro looks elsewhere
      let near = 1;
      for (const o of this.run) {
        if (o === r || o.carry || o.stun > 0) continue;
        const d = Math.hypot(px - o.a.pos.x, pz - o.a.pos.z);
        if (d + 0.6 < d1) near = Math.min(near, o.tgt === p ? lerp(0.75, 0.25, sk) : lerp(0.9, 0.55, sk));
      }
      v *= near;
      if (p.kind === 2) v *= r.greed * 1.4;
      if (p === r.tgt) v *= 1.3;
      v *= 1 + (rnd() - 0.5) * (1 - sk) * 0.9;
      if (v > bv) ((bv = v), (goal = G_FETCH), (tgt = p), (seat = -1));
    }
    // a carrier near: shove them
    let lead = 0;
    for (let j = 1; j < 4; j++) if (this.score[j] > this.score[lead]) lead = j;
    if (r.cd < 0.4) {
      for (const o of this.run) {
        if (o === r || !o.carry || o.stun > 0 || o.immune > 0) continue;
        const d = Math.hypot(o.a.pos.x - me.x, o.a.pos.z - me.z);
        if (d > 5.5) continue;
        let v = (this.eff(o.carry) / (d / sp + 0.9)) * (0.12 + 0.7 * sk);
        if (o.carry.kind === 2) v *= 1.6;
        if (sk > 0.6 && lead === o.i) v *= 1.3;
        if (room < W65) v *= 1.7;
        v *= 0.8 + rnd() * 0.4;
        if (v > bv) ((bv = v), (goal = G_SHOVE), (tgt = null), (seat = o.i));
      }
    }
    // a rival's crate left alone: lift its best parcel out
    if (sk > 0.3) {
      for (const t of this.crates) {
        if (t === c || !t.items.length || t.sealT >= 0) continue;
        let best: Parcel | null = null;
        for (const p of t.items) if (!best || this.eff(p) > this.eff(best)) best = p;
        if (!best) continue;
        // (no room for it: still worth it late in the block, as a denial; it goes in the next block)
        const full = room < W65;
        if (best.w > room && !(full && left < 6)) continue;
        const owner = this.run[t.seat].a.pos;
        const od = Math.hypot(owner.x - t.x, owner.z - t.z);
        if (od < 3.8) continue;
        const d = Math.hypot(t.x - me.x, t.z - me.z) - CH;
        const eta = d / sp + SNIPE + Math.hypot(t.x - c.x, t.z - c.z) / (sp * 0.88);
        if (d / sp + SNIPE > left - 0.2) continue;
        let v = (this.eff(best) / eta) * (0.15 + 0.55 * sk);
        if (full) v *= 2.2;
        v *= 0.8 + rnd() * 0.4;
        if (v > bv) ((bv = v), (goal = G_SNIPE), (tgt = null), (seat = t.seat));
      }
    }
    r.goal = goal;
    r.tgt = tgt;
    r.tgtSeat = seat;
  }

  /** Run toward (tx, tz), round the crates in the way (not `mine`, the one it is heading into). */
  private steer(i: number, tx: number, tz: number, k: number, mine: number) {
    const me = this.run[i].a.pos;
    const dx = tx - me.x,
      dz = tz - me.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.12) return;
    let nx = dx / d,
      nz = dz / d;
    for (const c of this.crates) {
      if (c.seat === mine) continue;
      const ox = me.x - c.x,
        oz = me.z - c.z;
      const od = Math.hypot(ox, oz);
      if (od > 3.4 || od < 1e-3) continue;
      // only when it is ahead
      if (ox * nx + oz * nz > 0) continue;
      const w = (3.4 - od) / 3.4;
      let ux = -oz / od,
        uz = ox / od;
      if (ux * dx + uz * dz < 0) ((ux = -ux), (uz = -uz));
      nx += (ux * 1.2 + (ox / od) * 0.5) * w;
      nz += (uz * 1.2 + (oz / od) * 0.5) * w;
    }
    let l = Math.hypot(nx, nz) || 1;
    // (on a belt: lean against it)
    if (this.L.belts) {
      const bv = this.beltAt(me.z);
      if (bv) {
        nx = nx / l - (bv / SPEED) * 0.8;
        nz = nz / l;
        l = Math.hypot(nx, nz) || 1;
      }
    }
    const slow = clamp(d / 0.6, 0.25, 1);
    this.mx = (nx / l) * k * slow;
    this.mz = (nz / l) * k * slow;
  }

  // ---- the parcels and the crates over time --------------------------------------------------------

  private tickParcels(dt: number) {
    for (const p of this.parcels) {
      if (!p.on) continue;
      if (p.st === GONE) {
        p.goneT += dt;
        if (p.goneT > 0.35) p.on = false;
        continue;
      }
      if (p.st === CARRY) {
        const o = this.run[p.seat];
        p.k = Math.min(1, p.k + dt / 0.16);
        const hx = o.a.pos.x,
          hy = o.a.pos.y + HOLD_Y + p.s / 2 + Math.abs(Math.sin(this.clk * 9 + p.seat)) * 0.06 * Math.min(1, Math.hypot(o.vx, o.vz) / 3),
          hz = o.a.pos.z;
        const u = easeOut(p.k);
        p.x = lerp(p.fx, hx, u);
        p.z = lerp(p.fz, hz, u);
        p.y = lerp(p.fy, hy, u) + Math.sin(u * Math.PI) * 0.5;
        const dy = o.a.yaw - p.ry;
        p.ry += Math.atan2(Math.sin(dy), Math.cos(dy)) * Math.min(1, dt * 10);
        p.rx *= Math.exp(-dt * 12);
        p.rz *= Math.exp(-dt * 12);
        continue;
      }
      if (p.st === IN) {
        p.k = Math.min(1, p.k + dt / 0.24);
        const u = p.k;
        p.x = lerp(p.fx, p.sx, u);
        p.z = lerp(p.fz, p.sz, u);
        p.y = lerp(p.fy, p.sy, u) + Math.sin(u * Math.PI) * 0.9;
        p.ry += (Math.round(p.ry / (Math.PI / 2)) * (Math.PI / 2) - p.ry) * Math.min(1, dt * 14);
        p.rx *= Math.exp(-dt * 14);
        p.rz *= Math.exp(-dt * 14);
        continue;
      }
      if (p.st === REST) {
        if (this.L.belts && p.kind !== 2) {
          const v = this.beltAt(p.z);
          if (v) {
            p.x += v * dt;
            p.ry += v * dt * 0.15;
            if (Math.abs(p.x) > this.xw - 0.55 && Math.sign(p.x) === Math.sign(v)) this.sink(p, true);
          }
        }
        continue;
      }
      // in flight
      p.vy -= p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rx += p.spin * dt;
      p.rz += p.spin * 0.6 * dt;
      const hs = p.s / 2;
      const xw = this.xw,
        zd = this.zd;
      if (p.x > xw - hs) ((p.x = xw - hs), (p.vx = -Math.abs(p.vx) * 0.5));
      if (p.x < -xw + hs) ((p.x = -xw + hs), (p.vx = Math.abs(p.vx) * 0.5));
      // (at the docks the parcels fly on over the water, and sink)
      if (!this.L.water) {
        if (p.z > zd - hs) ((p.z = zd - hs), (p.vz = -Math.abs(p.vz) * 0.5));
        if (p.z < -zd + hs) ((p.z = -zd + hs), (p.vz = Math.abs(p.vz) * 0.5));
      } else if (Math.abs(p.z) > zd && p.y < -0.35) {
        this.sink(p, false);
        continue;
      }
      // the crates: in through the top, or off a wall
      for (const c of this.crates) {
        const ix = Math.abs(p.x - c.x),
          iz = Math.abs(p.z - c.z);
        const bottom = p.y - hs;
        if (p.vy < 0 && ix < CI && iz < CI && bottom < CRATE_H + 0.1 && bottom > CRATE_H - 0.9 && p.kind !== 2) {
          if ((c.sealT < 0 || c.confirmed) && c.w + p.w <= CAP) {
            if (p.seat === c.seat) this.stats.throwsIn[c.seat]++;
            this.into(c, p, p.x, p.y, p.z);
            if (p.seat === this.human || c.seat === this.human) beep(c.seat === this.human ? 1318 : 400, 0.12, "square", 0.2);
            break;
          }
          // full or shut: it bounces off
          p.vy = 5.5;
          const ax = p.x - c.x,
            az = p.z - c.z;
          const al = Math.hypot(ax, az) || 1;
          p.vx = (ax / al) * 3 + (c.x === 0 ? 0 : -Math.sign(c.x) * 1.5);
          p.vz = (az / al) * 3 + -Math.sign(c.z) * 1.5;
          if (c.fullT <= 0) ((c.fullT = 1), this.pop(c.x, 2.4, c.z, T("FULL!", "满了！"), "#ff4466", false));
          this.predict(p);
          break;
        }
        if (ix < CH + hs && iz < CH + hs && bottom < CRATE_H) {
          if (CH + hs - ix < CH + hs - iz) ((p.x = c.x + Math.sign(p.x - c.x) * (CH + hs)), (p.vx = Math.sign(p.x - c.x) * Math.abs(p.vx) * 0.5));
          else ((p.z = c.z + Math.sign(p.z - c.z) * (CH + hs)), (p.vz = Math.sign(p.z - c.z) * Math.abs(p.vz) * 0.5));
          this.predict(p);
        }
      }
      if (p.st !== FLY) continue;
      // a thrown parcel bonks whoever it hits
      if (p.thrown)
        for (const o of this.run) {
          if (o.i === p.seat || o.stun > 0 || o.immune > 0) continue;
          const d = Math.hypot(o.a.pos.x - p.x, o.a.pos.z - p.z);
          if (d < 0.5 + hs && p.y > o.a.pos.y + 0.6 && p.y < o.a.pos.y + 2.4) this.bonk(p, o);
        }
      // the floor (none over the water: it falls on)
      if (p.y <= hs && p.vy < 0 && !(this.L.water && Math.abs(p.z) > this.zd)) {
        p.y = hs;
        if (p.kind === 2) {
          this.whaleLands(p);
          continue;
        }
        if (p.vy < -4.5) {
          p.vy *= -0.3;
          p.vx *= 0.5;
          p.vz *= 0.5;
          p.spin *= 0.5;
          this.fx.burst(this.v.set(p.x, 0.1, p.z), 5, ["#ffffff", "#a8d8e8"], { speed: 2, up: 1, size: 0.12, life: 0.35, gravity: 4 });
          this.predict(p);
        } else {
          p.st = REST;
          p.vx = p.vy = p.vz = 0;
          p.thrown = false;
          p.restAt = this.t;
          p.rx = Math.round(p.rx / (Math.PI / 2)) * (Math.PI / 2);
          p.rz = Math.round(p.rz / (Math.PI / 2)) * (Math.PI / 2);
        }
      }
    }
  }

  /** A parcel lost: into the harbour (a splash) or a furnace (a burst of flame). */
  private sink(p: Parcel, fire: boolean) {
    this.stats.sunk++;
    p.st = GONE;
    p.goneT = 0;
    p.vx = p.vy = p.vz = 0;
    const loud = p.seat === this.human || Math.abs(p.x - (this.human >= 0 ? this.run[this.human].a.pos.x : 99)) < 6;
    if (fire) {
      this.fx.burst(this.v.set(Math.sign(p.x) * (this.xw + 0.4), 0.8, p.z), 22, ["#ffd27a", "#ff6b35", "#ff3d1a", "#ffffff"], { speed: 5, up: 6, size: 0.2, life: 0.7, gravity: -2, drag: 1.5 });
      this.pop(Math.sign(p.x) * (this.xw - 0.6), 1.8, p.z, T(`BURNT −${this.eff(p)}`, `烧掉 −${this.eff(p)}`), "#ff8a3c", false);
      if (loud) beep(160, 0.25, "sawtooth", 0.14, 0.6);
    } else {
      this.fx.burst(this.v.set(p.x, -0.4, p.z), 18, ["#ffffff", "#a8e8ff", "#59c8ff"], { speed: 3.5, up: 6, size: 0.16, life: 0.6, gravity: 14 });
      this.ringFx(p.x, -0.5, p.z, 0.3, 1.6, 0.5, "#c8f2ff", 0.8);
      this.pop(p.x, 1.2, p.z, T("SPLASH!", "扑通！"), "#a8e8ff", false);
      if (loud) beep(300, 0.2, "sine", 0.18, 0.4);
    }
    this.live?.sink?.(p.x, p.z);
  }

  /** The belt's speed at depth z (m/s along x; 0 off the belts): the back belt runs at +beltV, the front one at −beltV. */
  private beltAt(z: number) {
    const b = this.L.belts;
    if (!b) return 0;
    for (let k = 0; k < b.z.length; k++) if (Math.abs(z - b.z[k]) < b.hw) return k === 0 ? this.beltV : -this.beltV;
    return 0;
  }

  private bonk(p: Parcel, o: Run) {
    this.stats.bonks++;
    o.stun = 0.5;
    o.hurt = 1;
    o.a.hit();
    o.spin = 5;
    o.vx += p.vx * 0.5;
    o.vz += p.vz * 0.5;
    o.angryT = 2;
    p.vx *= -0.25;
    p.vz *= -0.25;
    p.vy = 3;
    p.thrown = false;
    this.predict(p);
    this.fx.burst(this.v.set(p.x, p.y, p.z), 12, ["#ffffff", "#ffe14a", KIND_C[p.kind]], { speed: 4, up: 3, size: 0.16, life: 0.45 });
    this.pop(o.a.pos.x, 3.0, o.a.pos.z, T("BONK!", "砰！"), "#ffe14a", true);
    sfx.hit();
    this.cam.shake(o.i === this.human ? 0.25 : 0.1);
    if (o.i === this.human) this.hurtFx = 0.6;
    if (o.snipeOn >= 0) {
      this.crates[o.snipeOn].thief = -1;
      o.snipeOn = -1;
      o.snipe = 0;
    }
    if (o.carry) this.drop(o.i, p.vx, p.vz, true);
  }

  private whaleLands(p: Parcel) {
    p.st = REST;
    p.vx = p.vy = p.vz = 0;
    p.restAt = this.t;
    this.fx.burst(this.v.set(p.x, 0.3, p.z), 40, ["#ffffff", "#59e6ff", "#a8d8e8", "#c4b1fc"], { speed: 9, up: 4, size: 0.24, life: 0.8, gravity: 12 });
    this.ringFx(p.x, 0.1, p.z, 1, 5.5, 0.5, "#59e6ff", 1);
    this.ringFx(p.x, 0.1, p.z, 0.5, 3.5, 0.4, "#ffffff", 0.9);
    this.cam.shake(0.55);
    sfx.thud();
    beep(110, 0.4, "sine", 0.5, 0.5);
    // its shock knocks over whoever stood under it
    for (const o of this.run) {
      const dx = o.a.pos.x - p.x,
        dz = o.a.pos.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > 2.4 || o.immune > 0) continue;
      const nx = d > 0.01 ? dx / d : 1,
        nz = d > 0.01 ? dz / d : 0;
      o.stun = Math.max(o.stun, 0.45);
      o.vx = nx * 8;
      o.vz = nz * 8;
      o.a.vy = 6;
      o.a.grounded = false;
      o.a.hit();
      o.spin = 6;
      o.hurt = 1;
      if (o.carry) this.drop(o.i, nx, nz, true);
      if (o.i === this.human) this.hurtFx = 0.7;
    }
  }

  private tickCrates(dt: number) {
    for (const c of this.crates) {
      c.fullT -= dt;
      c.bump = Math.max(0, c.bump - dt * 4);
      const q = Math.sin(c.bump * Math.PI) * 0.1;
      c.g.scale.set(1 + q, 1 - q * 1.2, 1 + q);
      // the zone glows: softly yours, red while somebody digs in it
      if (c.thief >= 0) {
        c.alarmT += dt;
        c.zoneMat.color.copy(Math.floor(this.clk * 8) % 2 ? COL.red : COL.white);
        c.zoneMat.opacity = 0.9;
        if (Math.floor(c.alarmT * 4) !== Math.floor((c.alarmT - dt) * 4)) beep(Math.floor(c.alarmT * 4) % 2 ? 988 : 740, 0.08, "square", c.seat === this.human ? 0.22 : 0.08);
      } else {
        c.zoneMat.color.copy(c.color);
        // (yours pulses while you carry something to it)
        const mine = c.seat === this.human;
        const carrying = mine && !!this.run[c.seat].carry;
        c.zoneMat.opacity = carrying ? 0.55 + Math.sin(this.clk * 9) * 0.3 : 0.18 + Math.sin(this.clk * 3 + c.seat) * 0.06 + (mine ? 0.12 : 0);
      }
      if (c.sealT < 0) continue;
      c.sealT += dt;
      // the lid: down it comes, slams, the stamp; then up and away once the block is confirmed
      if (!c.confirmed) {
        c.lidV -= 46 * dt;
        c.lidY += c.lidV * dt;
        if (c.lidY <= c.lidRest) {
          c.lidY = c.lidRest;
          if (!c.landed) {
            c.landed = true;
            c.bump = 1;
            c.lidV = 0;
            const col = this.players[c.seat].color;
            this.fx.burst(this.v.set(c.x, c.lidRest, c.z), 26, [col, "#ffffff", "#ffe14a"], { speed: 7, up: 6, size: 0.2, life: 0.8 });
            this.ringFx(c.x, 0.08, c.z, 1.2, 4.2, 0.45, col, 0.9);
            this.cam.shake(0.3);
            if (c.seat === 0) sfx.thud();
            c.beam.visible = true;
            // its fees fly to its panel
            const sp = toScreen(this.v.set(c.x, c.lidRest + 0.6, c.z), this.w.camera);
            this.flyers.push({ seat: c.seat, s: `+${c.sealedFee}`, x0: sp.x, y0: sp.y, t: this.clk, v: c.sealedFee, done: false });
          } else c.lidV = Math.abs(c.lidV) < 1 ? 0 : -c.lidV * 0.2;
        }
        const sq = c.landed ? Math.max(0, 1 - (c.sealT - 0.2) * 6) : 0;
        c.lid.scale.set(1 + sq * 0.06, 1 - sq * 0.25, 1 + sq * 0.06);
        if (c.sealT >= SEAL) {
          c.confirmed = true;
          c.lidV = 11;
          for (const p of c.items) {
            p.st = GONE;
            p.goneT = 0;
          }
          this.fx.burst(this.v.set(c.x, CRATE_H, c.z), 14, ["#ffffff", "#a8d8e8"], { speed: 3, up: 6, size: 0.15, life: 0.6, gravity: -2, drag: 2 });
          c.items.length = 0;
          c.w = 0;
        }
      } else {
        c.lidV += 6 * dt;
        c.lidY += c.lidV * dt;
        const k = clamp(1 - (c.lidY - c.lidRest) / 7, 0, 1);
        c.lid.scale.setScalar(Math.max(0.01, k));
        if (c.lidY > c.lidRest + 7) {
          c.lid.visible = false;
          c.sealT = -1;
        }
      }
      c.lid.position.set(c.x, c.lidY, c.z);
      c.lid.rotation.y = c.confirmed ? (c.lidY - c.lidRest) * 0.4 : 0;
      const bk = c.landed ? clamp(1 - (c.sealT - 0.15) / 1.0, 0, 1) : 0;
      c.beamMat.opacity = bk * 0.55;
      c.beam.scale.set(CH * (0.9 + (1 - bk) * 0.4), 12, CH * (0.9 + (1 - bk) * 0.4));
      if (bk <= 0 && c.landed) c.beam.visible = false;
    }
  }

  // ---- effects -----------------------------------------------------------------------------------

  private ringFx(x: number, y: number, z: number, r0: number, r1: number, dur: number, color: string, a0 = 0.9) {
    let r = this.rings.find((q) => !q.on);
    if (!r) {
      if (this.rings.length >= 14) return;
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      const m = new THREE.Mesh(GEO.ring, mat);
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 4;
      this.w.scene.add(m);
      r = { m, mat, t: 0, dur, r0, r1, a0, on: false };
      this.rings.push(r);
    }
    r.mat.color.set(color);
    r.m.position.set(x, y, z);
    r.t = 0;
    r.dur = dur;
    r.r0 = r0;
    r.r1 = r1;
    r.a0 = a0;
    r.on = true;
    r.m.visible = true;
  }

  private pop(x: number, y: number, z: number, s: string, c: string, big: boolean) {
    this.pops.push({ x, y, z, s, c, t: this.clk, big });
  }

  private say(s: string, c: string, dur = 1.5, size = 58, delay = 0, y = H * 0.3) {
    this.banners.push({ s, c, t: this.clk + delay, dur, size, y });
  }

  /** Everything that only moves: the pads, the clock round the ⓩ, the whale's glow, the rings. */
  private animate(dt: number) {
    const t = this.clk;
    for (const b of this.decor) b.tick(t);
    for (let k = 0; k < this.qbs.length; k++) ((this.qbs[k].rotation.y = t * (0.9 + k * 0.3)), (this.qbs[k].position.y = 5.2 + Math.sin(t * 1.4 + k * 2) * 0.3));
    if (this.live) {
      for (let i = 0; i < 4; i++) ((this.cxs[i] = this.crates[i].x), (this.czs[i] = this.crates[i].z));
      this.live.tick(dt, { t, cx: this.cxs, cz: this.czs, belt: this.beltV, warn: this.warnB, playing: this.phase === "play" });
    }
    // the pads flare before they shoot
    for (let k = 0; k < 4; k++) {
      this.padGlow[k] = Math.max(0, this.padGlow[k] - dt * 2.2);
      const pd = this.pads[k];
      const g = this.padGlow[k];
      pd.mat.opacity = 0.35 + 0.15 * Math.sin(t * 4 + k) + g * 0.6;
      pd.disc.scale.setScalar(1.4 + g * 0.35);
      pd.ring.rotation.z = t * (1.5 + g * 6);
      pd.ring.position.y = 0.45 + Math.sin(t * 2 + k) * 0.08 + g * 0.4;
      pd.ring.scale.setScalar(1.6 + g * 0.6);
      pd.mat.color.copy(this.makers ? COL.padM : COL.lane);
    }
    // the block clock: a tile a second round the ⓩ, red at the end, all white when the block is found
    const len = BLOCKS[this.blk];
    const done = this.phase === "play" ? (this.blkT / len) * 12 : this.phase === "tally" ? 12 : 0;
    const end = this.phase === "play" && len - this.blkT < 3;
    const on = this.makers ? COL.lilac : COL.flare;
    for (let k = 0; k < 12; k++) {
      if (this.flash > 0) this.C.copy(COL.white);
      else if (k < Math.floor(done)) this.C.copy(end && Math.floor(t * 6) % 2 ? COL.red : on);
      else if (k < done) this.C.copy(on).lerp(COL.off, 1 - (done - k));
      else this.C.copy(COL.off);
      this.lights.setColorAt(k, this.C);
    }
    if (this.lights.instanceColor) this.lights.instanceColor.needsUpdate = true;
    this.tailMat.color.copy(this.flash > 0 ? COL.white : COL.flare);
    this.tail.position.y = 0.06 + this.flash * 0.5;
    this.lanes.color.copy(this.makers ? COL.lilac : COL.lane);
    this.lanes.opacity = 0.55 + Math.sin(t * 3) * 0.2;
    // the Shielded Hour washes the light lilac
    this.C.copy(this.hemi0);
    if (this.makers) this.C.lerp(COL.wash, 0.45);
    this.w.hemi.color.lerp(this.C, Math.min(1, dt * 3));
    // the whale: its halo, and the red ring under it while it falls
    const wh = this.whale;
    if (wh && wh.on && wh.kind === 2 && wh.st !== IN && wh.st !== GONE) {
      this.halo.visible = true;
      this.halo.position.set(wh.x, wh.y, wh.z);
      this.halo.scale.setScalar(wh.s * (1.55 + Math.sin(t * 6) * 0.08));
      this.haloMat.opacity = 0.22 + Math.sin(t * 6) * 0.06;
      const falling = wh.st === FLY && wh.y > wh.s;
      this.danger.visible = falling;
      if (falling) {
        const k = clamp(1 - (wh.y - wh.s) / 20, 0, 1);
        this.danger.position.set(wh.lx, 0.06, wh.lz);
        this.danger.scale.setScalar(4.8 - k * 0.6 + Math.sin(t * (8 + k * 16)) * 0.15);
        this.dangerMat.opacity = 0.5 + k * 0.45;
      }
    } else {
      this.halo.visible = false;
      this.danger.visible = false;
    }
    for (const r of this.rings) {
      if (!r.on) continue;
      r.t += dt;
      const k = r.t / r.dur;
      if (k >= 1) {
        r.on = false;
        r.m.visible = false;
        continue;
      }
      r.m.scale.setScalar(lerp(r.r0, r.r1, easeOut(k)) * 2);
      r.mat.opacity = r.a0 * (1 - k);
    }
    this.fx.update(dt);
  }

  /** The parcels into their instances and their shadows onto the floor. */
  private render() {
    let n = 0;
    this.marks.begin();
    const M = this.M,
      Q = this.Q,
      E = this.E,
      P = this.P,
      S = this.S,
      C = this.C;
    const pulse = 0.5 + 0.5 * Math.sin(this.clk * 7);
    for (const p of this.parcels) {
      if (!p.on || n >= CAPP) continue;
      let sc = p.s;
      // a pop when it appears, a shrink when it is confirmed or evicted
      if (p.born >= 0 && this.clk - p.born < 0.25 && p.st === FLY) sc *= 0.5 + backOut(clamp((this.clk - p.born) / 0.25, 0, 1)) * 0.5;
      if (p.st === GONE) sc *= Math.max(0.01, 1 - p.goneT / 0.35);
      if (p.st === REST && p.kind === 1 && this.makers) sc *= 1 + pulse * 0.06;
      E.set(p.rx, p.ry, p.rz, "YXZ");
      Q.setFromEuler(E);
      P.set(p.x, p.y, p.z);
      M.compose(P, Q, S.set(sc, sc, sc));
      this.body.setMatrixAt(n, M);
      C.copy(p.big ? COL.big[p.kind] : COL.kind[p.kind]);
      if (p.kind === 1 && this.makers) C.lerp(COL.white, pulse * 0.25);
      if (p.kind === 2) C.lerp(COL.white, pulse * 0.3);
      if (p.st === GONE) C.lerp(COL.white, clamp(p.goneT / 0.2, 0, 1));
      this.body.setColorAt(n, C);
      const ink = 0.09;
      M.compose(P, Q, S.set(sc + ink, sc + ink, sc + ink));
      this.hull.setMatrixAt(n, M);
      M.compose(P, Q, S.set(sc * 1.025, sc * 1.025, sc * 0.2));
      this.tape.setMatrixAt(n * 2, M);
      M.compose(P, Q, S.set(sc * 0.2, sc * 1.025, sc * 1.025));
      this.tape.setMatrixAt(n * 2 + 1, M);
      if (p.st === REST || p.st === FLY) {
        const h = Math.max(0, p.y - p.s / 2);
        const k = clamp(1 - h / (p.kind === 2 ? 22 : 7), 0.25, 1);
        const sx = p.st === FLY ? lerp(p.lx, p.x, k) : p.x,
          sz = p.st === FLY ? lerp(p.lz, p.z, k) : p.z;
        // (no shadow on the water: a parcel headed there just falls)
        if (!(this.L.water && Math.abs(sz) > this.zd))
          this.marks.add(sx, sz, p.s * (0.75 + (1 - k) * 0.25), (p.kind === 2 ? 0.75 : 0.55) * (0.35 + k * 0.65), 0.3);
      }
      n++;
    }
    // the snarks' carried parcels cast no shadow of their own; the crates' sit in shade
    this.body.count = n;
    this.hull.count = n;
    this.tape.count = n * 2;
    this.body.instanceMatrix.needsUpdate = true;
    if (this.body.instanceColor) this.body.instanceColor.needsUpdate = true;
    this.hull.instanceMatrix.needsUpdate = true;
    this.tape.instanceMatrix.needsUpdate = true;
    this.marks.end();
  }

  // ---- the HUD -----------------------------------------------------------------------------------

  view() {
    return this.w;
  }

  draw(g: CanvasRenderingContext2D) {
    if (this.phase === "card") return;
    const cam = this.w.camera;
    // the edges flash red when you are hit or robbed, lilac through the Shielded Hour
    if (this.hurtFx > 0) {
      const gr = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62);
      gr.addColorStop(0, "rgba(0,0,0,0)");
      gr.addColorStop(1, `rgba(255,40,70,${0.42 * this.hurtFx})`);
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
    } else if (this.makers && this.phase === "play") {
      const gr = g.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, W * 0.65);
      gr.addColorStop(0, "rgba(0,0,0,0)");
      gr.addColorStop(1, `rgba(196,177,252,${0.2 + Math.sin(this.clk * 4) * 0.06})`);
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
    }
    if (this.flash > 0) {
      g.fillStyle = `rgba(255,255,255,${this.flash * 0.25})`;
      g.fillRect(0, 0, W, H);
    }
    const tallying = this.phase === "tally";
    // the fee tags over the parcels on the floor
    if (!tallying)
      for (const p of this.parcels) {
        if (!p.on || (p.st !== REST && p.st !== FLY)) continue;
        if (p.kind === 2 && p.st === FLY && p.y > 9) continue;
        const s = toScreen(this.v.set(p.x, p.y + p.s / 2 + 0.38, p.z), cam);
        if (!s.on) continue;
        this.feeTag(g, p, s.x, s.y);
      }
    // the crates' gauges
    for (const c of this.crates) this.gauge(g, c);
    // name tags (and the snipe's ring over a thief)
    for (const r of this.run) {
      const s = toScreen(r.a.head(this.v), cam);
      if (!s.on) continue;
      const y = r.carry ? s.y - 16 : s.y;
      tag(g, r.p, s.x, y);
      if (r.carry && r.carry.kind === 2) fee(g, String(WHALE_FEE), s.x, y - 28, 18, "#59e6ff", "center");
      if (r.snipeOn >= 0) this.snipeRing(g, s.x, y - 34, r.snipe / SNIPE);
    }
    // the floating numbers
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      const k = (this.clk - p.t) / 1.0;
      if (k >= 1) {
        this.pops.splice(i, 1);
        continue;
      }
      const s = toScreen(this.v.set(p.x, p.y, p.z), cam);
      const sc = backOut(Math.min(1, k * 4));
      g.globalAlpha = k > 0.6 ? (1 - k) / 0.4 : 1;
      shout(g, p.s, s.x, s.y - 10 - k * 34, (p.big ? 30 : 22) * sc, p.c);
      g.globalAlpha = 1;
    }
    this.panels(g);
    if (!tallying) this.blockHud(g);
    // the fees flying to the panels
    for (const f of this.flyers) {
      if (f.done) continue;
      const k = (this.clk - f.t) / 0.75;
      const [px, py] = this.panelAt(f.seat);
      if (k >= 1) {
        f.done = true;
        this.shown[f.seat] += f.v;
        this.bump[f.seat] = 1;
        if (f.seat === this.human && f.v > 0) sfx.chips();
        continue;
      }
      const u = easeOut(k);
      const x = lerp(f.x0, px, u),
        y = lerp(f.y0, py, u) - Math.sin(u * Math.PI) * 60;
      const sz = 30 * (1 - u * 0.35) * backOut(Math.min(1, k * 5));
      shout(g, f.s, x, y, sz, f.v > 0 ? "#ffffff" : "rgba(255,255,255,0.6)");
    }
    if (this.flyers.length > 12) this.flyers = this.flyers.filter((f) => !f.done);
    for (let i = this.banners.length - 1; i >= 0; i--) {
      const b = this.banners[i];
      const k = (this.clk - b.t) / b.dur;
      if (k >= 1) {
        this.banners.splice(i, 1);
        continue;
      }
      if (k > 0) banner(g, b.s, k, b.c, b.y, b.size);
    }
    if (tallying) this.tally(g);
  }

  private panelAt(seat: number): [number, number] {
    const [x, y] = cornerSpot(seat);
    return [x + 98, y + 29];
  }

  /** The four corners: the fees banked so far, this block's crate under them, a crown on the leader. */
  private panels(g: CanvasRenderingContext2D) {
    let top = 0;
    for (const v of this.shown) top = Math.max(top, v);
    const lead = this.leadL,
      vals = this.valsL,
      sub = this.subL;
    lead.length = 0;
    for (let i = 0; i < 4; i++) {
      if (top > 0 && this.shown[i] === top) lead.push(i);
      vals[i] = String(this.shown[i]);
      const c = this.crates[i];
      let f = 0;
      for (const p of c.items) f += this.eff(p);
      // (a small screen: the short way, clear of the coin before the figure)
      sub[i] = this.phase === "tally" ? T("final", "最终") : c.sealT >= 0 && !c.confirmed ? T("sealed ✓", "已封块 ✓") : HUD.min ? T(`crate +${f}`, `箱 +${f}`) : T(`in crate: +${f}`, `箱内：+${f}`);
    }
    corners(g, this.players, vals, { lead, sub });
    // a coin before each figure
    for (let i = 0; i < 4; i++) {
      const [cx, cy] = this.panelAt(i);
      const v = vals[i];
      g.font = `900 ${v.length > 4 ? 22 : 27}px ${FONT}`;
      chip(g, cx - 98 + 184 - g.measureText(v).width - 13, cy + 1, 9);
    }
    for (let i = 0; i < 4; i++) {
      const b = this.bump[i],
        l = this.loss[i];
      if (b <= 0 && l <= 0) continue;
      const [cx, cy] = this.panelAt(i);
      g.save();
      rr(g, cx - 98 - 3, cy - 29 - 3, 196 + 6, 58 + 6, 21);
      g.lineWidth = 3 + b * 3;
      g.strokeStyle = l > b ? `rgba(255,60,90,${l})` : `rgba(255,255,255,${b})`;
      g.stroke();
      g.restore();
    }
  }

  /** The block timer: a ring that fills with the block, its number, the four blocks as pips. */
  private blockHud(g: CanvasRenderingContext2D) {
    const len = BLOCKS[this.blk];
    const k = this.phase === "play" ? clamp(this.blkT / len, 0, 1) : 0;
    const left = Math.max(0, len - (this.phase === "play" ? this.blkT : 0));
    const last = left < 3 && this.phase === "play";
    const cx = W / 2,
      cy = 40;
    const w = 214,
      h = 50;
    g.save();
    const shake = last ? Math.sin(this.clk * 40) * 1.2 * (left % 1) : 0;
    g.translate(cx + shake, cy);
    rr(g, -w / 2, -h / 2 + 4, w, h, h / 2);
    g.fillStyle = "rgba(6,3,18,0.4)";
    g.fill();
    rr(g, -w / 2 - 1.5, -h / 2 - 1.5, w + 3, h + 3, h / 2 + 1.5);
    g.fillStyle = INK;
    g.fill();
    rr(g, -w / 2 + 1, -h / 2 + 1, w - 2, h - 2, h / 2 - 1);
    g.fillStyle = "#ffffff";
    g.fill();
    rr(g, -w / 2 + 4, -h / 2 + 4, w - 8, h - 8, h / 2 - 4);
    const gr = g.createLinearGradient(0, -h / 2, 0, h / 2);
    if (this.makers) (gr.addColorStop(0, "#9b7cf0"), gr.addColorStop(1, "#4b2fa0"));
    else if (this.blk === 3) (gr.addColorStop(0, "#ff7a3d"), gr.addColorStop(1, "#b2340e"));
    else (gr.addColorStop(0, "#3a2c86"), gr.addColorStop(1, "#1a1240"));
    g.fillStyle = gr;
    g.fill();
    // the ring: the block filling up
    const rx = -w / 2 + 27;
    g.beginPath();
    g.arc(rx, 0, 18, 0, Math.PI * 2);
    g.fillStyle = INK;
    g.fill();
    g.lineWidth = 6;
    g.strokeStyle = "rgba(255,255,255,0.18)";
    g.beginPath();
    g.arc(rx, 0, 14, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = last ? (Math.floor(this.clk * 6) % 2 ? "#ff3355" : "#ffffff") : this.makers ? LILAC : "#ff6b35";
    g.lineCap = "round";
    g.beginPath();
    g.arc(rx, 0, 14, -Math.PI / 2, -Math.PI / 2 + Math.max(0.01, k) * Math.PI * 2);
    g.stroke();
    numeral(g, String(Math.ceil(left)), rx, 1, 15, "#ffffff", "center");
    toy(g, T(`BLOCK #${this.blk + 1}`, `区块 #${this.blk + 1}`), 26, -5, 21, "#ffffff", { rim: false });
    // the pips: the blocks of the game
    for (let b = 0; b < 4; b++) {
      const px = -16 + b * 22,
        py = 15;
      rr(g, px, py - 3.5, 16, 7, 3.5);
      g.fillStyle = b < this.blk ? BLOCK_C[b] : b === this.blk ? (Math.floor(this.clk * 3) % 2 ? "#ffffff" : BLOCK_C[b]) : "rgba(255,255,255,0.2)";
      g.fill();
    }
    g.restore();
    const tagS = this.makers ? T("SHIELDED HOUR · lilac ×2", "屏蔽时刻 · 淡紫 ×2") : this.blk === 3 ? T("LAST BLOCK", "最后一个区块") : "";
    if (tagS) {
      g.font = `900 12px ${FONT}`;
      const tw = g.measureText(tagS).width + 22;
      rr(g, cx - tw / 2, cy + 28, tw, 20, 10);
      g.fillStyle = INK;
      g.fill();
      rr(g, cx - tw / 2 + 2, cy + 30, tw - 4, 16, 8);
      g.fillStyle = this.makers ? LILAC : "#ff6b35";
      g.fill();
      text(g, tagS, cx, cy + 38.5, 12, this.makers ? INK : "#ffffff", "center", 900);
    }
  }

  /** A parcel's fee tag: a pill with a ⓩ chip in the parcel's colour and its weight under it. */
  private feeTag(g: CanvasRenderingContext2D, p: Parcel, x: number, y: number) {
    const v = this.eff(p);
    const whale = p.kind === 2;
    const dbl = p.kind === 1 && this.makers;
    // (the sizes as drawn: on a small screen the letters are grown, and the pill and its tab with them)
    const fs = fpx(whale ? 19 : 14);
    const s = String(v);
    g.font = `900 ${fs}px ${FONT}`;
    const tw = g.measureText(s).width;
    const h = Math.max(whale ? 26 : 20, fs + 6);
    const w = tw + h + (whale ? 14 : 9);
    const x0 = x - w / 2,
      y0 = y - h / 2;
    const kc = KIND_C[p.kind];
    // the weight tab under it
    const ws = `${p.w}kB`;
    const wf = fpx(whale ? 10 : 9);
    const th = Math.max(whale ? 14 : 12, wf + 3);
    g.font = `800 ${wf}px ${FONT}`;
    const ww = g.measureText(ws).width + 8;
    rr(g, x - ww / 2, y0 + h - 2, ww, th, 4);
    g.fillStyle = INK;
    g.fill();
    text(g, ws, x, y0 + h - 2 + th / 2, wf, p.big ? "#ffd0b8" : "#d6d2f0", "center", 800);
    if (dbl || whale) {
      g.save();
      g.globalAlpha = 0.45 + Math.sin(this.clk * 8) * 0.2;
      rr(g, x0 - 4, y0 - 4, w + 8, h + 8, h / 2 + 4);
      g.fillStyle = kc;
      g.fill();
      g.restore();
    }
    rr(g, x0 - 2, y0 - 2, w + 4, h + 4, h / 2 + 2);
    g.fillStyle = INK;
    g.fill();
    rr(g, x0, y0, w, h, h / 2);
    g.fillStyle = "#ffffff";
    g.fill();
    // the ⓩ chip
    const cr = h / 2 - 2.5;
    g.beginPath();
    g.arc(x0 + h / 2, y, cr, 0, Math.PI * 2);
    g.fillStyle = kc;
    g.fill();
    text(g, "Z", x0 + h / 2, y + 0.5, cr * 1.35, p.kind === 1 ? INK : "#ffffff", "center", 900);
    text(g, s, x0 + h + 2 + tw / 2, y + 1, fs, dbl ? "#6a3fd8" : INK, "center", 900);
    if (dbl) shout(g, "×2", x0 + w + 6, y0 - 2, 12, LILAC);
    if (whale) shout(g, T("WHALE", "巨鲸"), x, y0 - 12, 15, "#59e6ff");
  }

  /** Over each crate: its fees this block, a weight bar of its parcels (28 kB), FULL or SEALED. */
  private gauge(g: CanvasRenderingContext2D, c: Crate) {
    const s = toScreen(this.v.set(c.x, CRATE_H + 1.55, c.z + CH * 0.4), this.w.camera);
    if (!s.on) return;
    const p = this.players[c.seat];
    // (a small screen: wider, so the fee and the grown weight keep apart; up over the pad when its crate is in a thumb's corner)
    const w = HUD.min ? 150 : 112,
      h = 40;
    const x = s.x,
      y = offThumbs(x, s.y - 6, w, h + 6);
    let sum = 0;
    for (const q of c.items) sum += this.eff(q);
    const sealed = c.sealT >= 0 && !c.confirmed;
    const sc = 1 + Math.sin(c.bump * Math.PI) * 0.12;
    g.save();
    g.translate(x, y);
    g.scale(sc, sc);
    rr(g, -w / 2, -h / 2 + 3, w, h, 12);
    g.fillStyle = "rgba(6,3,18,0.35)";
    g.fill();
    rr(g, -w / 2 - 1.5, -h / 2 - 1.5, w + 3, h + 3, 13);
    g.fillStyle = c.thief >= 0 && Math.floor(this.clk * 8) % 2 ? "#ff3355" : INK;
    g.fill();
    rr(g, -w / 2 + 1, -h / 2 + 1, w - 2, h - 2, 11);
    const gr = g.createLinearGradient(0, -h / 2, 0, h / 2);
    gr.addColorStop(0, tint(p.color, -0.25));
    gr.addColorStop(1, tint(p.color, -0.62));
    g.fillStyle = gr;
    g.fill();
    // the fee
    fee(g, String(sum), -w / 2 + 8, -6, 17, "#ffffff", "left");
    text(g, `${c.w}/${CAP} kB`, w / 2 - 8, -6, 10.5, "rgba(255,255,255,0.85)", "right", 800);
    // the weight bar, a segment per parcel in its colour
    const bx = -w / 2 + 8,
      by = 8,
      bw = w - 16,
      bh = 9;
    rr(g, bx - 1.5, by - 1.5, bw + 3, bh + 3, 5);
    g.fillStyle = INK;
    g.fill();
    rr(g, bx, by, bw, bh, 4);
    g.fillStyle = "rgba(255,255,255,0.14)";
    g.fill();
    let ox = bx;
    for (const q of c.items) {
      const sw = (q.w / CAP) * bw;
      g.fillStyle = q.big ? KIND_BIG[q.kind] : KIND_C[q.kind];
      g.fillRect(ox + 0.5, by + 0.5, sw - 1, bh - 1);
      ox += sw;
    }
    // ticks every 5 kB
    g.fillStyle = "rgba(10,6,30,0.45)";
    for (let kb = 5; kb < CAP; kb += 5) g.fillRect(bx + (kb / CAP) * bw - 0.5, by, 1, bh);
    g.restore();
    if (sealed && c.landed) {
      g.save();
      g.translate(x, y);
      g.rotate(-0.12);
      const k = backOut(clamp((c.sealT - 0.2) / 0.25, 0, 1));
      g.scale(k, k);
      rr(g, -46, -14, 92, 28, 8);
      g.fillStyle = "#ffffff";
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = INK;
      g.stroke();
      text(g, `+${c.sealedFee} ✓`, 8, 1, 17, tint(p.color, -0.35), "center", 900);
      chip(g, -26, 0, 8);
      g.restore();
    } else if (CAP - c.w < W65) {
      g.save();
      g.translate(x + w / 2 - 4, y - h / 2 - 4);
      g.rotate(0.12);
      rr(g, -22, -9, 44, 18, 6);
      g.fillStyle = "#8ee35b";
      g.fill();
      g.lineWidth = 2.5;
      g.strokeStyle = INK;
      g.stroke();
      text(g, T("FULL", "满"), 0, 1, 11, INK, "center", 900);
      g.restore();
    }
    if (c.thief >= 0) shout(g, "!", x - w / 2 - 6, y - 4, 26, "#ff3355");
    // yours, pointed out at the start
    if (c.seat === this.human && (this.phase === "count" || (this.phase === "play" && this.t < 4))) {
      const k = this.phase === "count" ? 1 : clamp((4 - this.t) / 0.6, 0, 1);
      g.save();
      g.globalAlpha = k;
      const by = y - h / 2 - 22 + Math.sin(this.clk * 7) * 4;
      shout(g, T("YOUR CRATE", "你的箱子"), x, by, 17, p.color);
      shout(g, "▼", x, by + 15, 14, "#ffffff");
      g.restore();
    }
  }

  private snipeRing(g: CanvasRenderingContext2D, x: number, y: number, k: number) {
    g.save();
    g.beginPath();
    g.arc(x, y, 15, 0, Math.PI * 2);
    g.fillStyle = INK;
    g.fill();
    g.lineWidth = 5;
    g.strokeStyle = "rgba(255,255,255,0.2)";
    g.beginPath();
    g.arc(x, y, 11, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = "#ff3355";
    g.lineCap = "round";
    g.beginPath();
    g.arc(x, y, 11, -Math.PI / 2, -Math.PI / 2 + clamp(k, 0.01, 1) * Math.PI * 2);
    g.stroke();
    text(g, "✋", x, y + 1, 11, "#ffffff", "center", 900);
    g.restore();
  }

  /** The fee tally at the end: a row each, the four blocks' fees stacked, the winner crowned. */
  private tally(g: CanvasRenderingContext2D) {
    const order = this.final;
    if (!order) return;
    const k = this.tallyT - SEAL * 0.7;
    if (k <= 0) return;
    const fade = this.over ? clamp(1 - this.post / 0.3, 0, 1) : 1;
    if (fade <= 0) return;
    const bw = 540,
      bh = 262;
    const x0 = W / 2 - bw / 2;
    const y0 = 104 - (1 - easeOut(clamp(k / 0.35, 0, 1))) * 40;
    g.save();
    g.globalAlpha = clamp(k / 0.25, 0, 1) * fade;
    rr(g, x0, y0 + 5, bw, bh, 22);
    g.fillStyle = "rgba(6,3,18,0.45)";
    g.fill();
    rr(g, x0 - 2, y0 - 2, bw + 4, bh + 4, 24);
    g.fillStyle = INK;
    g.fill();
    rr(g, x0 + 1, y0 + 1, bw - 2, bh - 2, 21);
    g.fillStyle = "#ffffff";
    g.fill();
    rr(g, x0 + 5, y0 + 5, bw - 10, bh - 10, 18);
    const gr = g.createLinearGradient(0, y0, 0, y0 + bh);
    gr.addColorStop(0, "#2e2370");
    gr.addColorStop(1, "#140e38");
    g.fillStyle = gr;
    g.fill();
    toy(g, T("FEE TALLY", "手续费结算"), W / 2, y0 + 30, 30, ACCENT);
    // the legend: the four blocks' colours
    for (let b = 0; b < 4; b++) {
      const lx = x0 + 150 + b * 64;
      rr(g, lx, y0 + 52, 12, 10, 3);
      g.fillStyle = BLOCK_C[b];
      g.fill();
      text(g, `#${b + 1}`, lx + 16, y0 + 57.5, 10, "rgba(255,255,255,0.7)", "left", 800);
    }
    let top = 1;
    for (const v of this.score) top = Math.max(top, v);
    const barX = x0 + 150,
      barW = 280;
    order.forEach((seat, r) => {
      const p = this.players[seat];
      const c = this.crates[seat];
      const y = y0 + 92 + r * 44;
      const grow = clamp((k - 0.25 - r * 0.08) / 1.1, 0, 1);
      const crowned = r === 0 && k > 1.55;
      if (crowned) {
        rr(g, x0 + 14, y - 20, bw - 28, 40, 14);
        g.fillStyle = `rgba(255,255,255,${0.1 + Math.sin(this.clk * 6) * 0.05})`;
        g.fill();
      }
      text(g, String(r + 1), x0 + 26, y + 1, 18, r === 0 ? "#ffd23f" : "rgba(255,255,255,0.6)", "center", 900);
      badge(g, p, x0 + 58, y, 32, {});
      text(g, short(p), x0 + 82, y + 1, 13, tint(p.color, 0.35), "left", 900);
      rr(g, barX - 2, y - 11, barW + 4, 22, 8);
      g.fillStyle = INK;
      g.fill();
      let ox = barX;
      const total = this.score[seat];
      const lim = (total / top) * barW * easeOut(grow);
      for (let b = 0; b < 4; b++) {
        const sw = Math.min((c.blocks[b] / top) * barW, barX + lim - ox);
        if (sw <= 0) break;
        g.fillStyle = BLOCK_C[b];
        g.fillRect(ox, y - 8, sw, 16);
        g.fillStyle = "rgba(255,255,255,0.3)";
        g.fillRect(ox, y - 8, sw, 4);
        ox += sw;
      }
      fee(g, String(Math.round(total * easeOut(grow))), x0 + bw - 22, y + 1, 22, crowned ? "#ffe680" : "#ffffff", "right");
      if (crowned) crown(g, x0 + 58, y - 15, 22, Math.sin(this.clk * 5) * 1.5);
    });
    g.restore();
  }

  result() {
    return this.over;
  }

  humanOut() {
    return false;
  }

  dispose() {
    for (const r of this.run) r.a.dispose();
    for (const m of this.stampMats) (m.map?.dispose(), m.dispose());
    disposeScene(this.w.scene);
  }
}

export const MEMPOOL: MiniDef = {
  key: "mempool",
  title: "MEMPOOL RUSH",
  titleZh: "内存池大抢运",
  tag: "Build Zcash blocks: grab fee parcels, fill your crate before the block is found!",
  tagZh: "打包 Zcash 区块：抢手续费包裹，在出块前装满你的箱子！",
  goal: "Fill your crate with the best fees before the block is found!",
  goalZh: "在区块被找到之前，用手续费最高的包裹装满你的箱子！",
  help: "A grabs, A again throws: run parcels into your crate. It holds 28 kB (Orchard parcels weigh 7, Sapling ones 5): pick the best ⓩ fee per kB. B shoves a carrier; hold A at a rival's crate to steal.",
  helpZh: "A 键拾起，再按 A 扔出：把包裹送进你的箱子。箱子容量 28 kB（Orchard 包裹重 7，Sapling 包裹重 5）：挑每 kB ⓩ 手续费最高的。B 键撞倒搬运者；在对手箱边按住 A 可偷包裹。",
  pad: ["left", "right", "up", "down", "a", "b"],
  tap: false,
  color: ACCENT,
  song: "funk",
  ambience: "city-night",
  variants: LEVELS.map((l) => ({ key: l.key, title: l.title, titleZh: l.titleZh, tag: l.tag, tagZh: l.tagZh, thumb: `mempool-${l.key}`, song: l.song, ambience: l.ambience })),
  make: (players, rnd, variant) => new Mempool(players, rnd, LEVELS.find((l) => l.key === variant) ?? LEVELS[Math.floor(rnd() * LEVELS.length) % LEVELS.length]),
};
export default MEMPOOL;
