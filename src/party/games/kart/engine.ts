/**
 * SNARK KART's race: four zkSNARKs in voxel karts on a course (course.ts: a track, its look, its
 * scenery, its weather). You always accelerate; ◀ ▶ steer, ▼ brakes. Hold A (Space) in a turn to
 * drift: the longer it lasts the hotter the sparks (blue, orange, purple), and letting go fires a
 * mini-turbo that strong. A in the air off a jump: a trick, a boost when you land. Press A on the "1"
 * of the countdown for a rocket start (too early and the engine stalls). Boost pads sit on the good
 * line; tuck in behind a kart for a slipstream; ⓩ coins raise the top speed. Z-Blocks give an item,
 * B (X / E / Shift) uses it: TURBO (×3 for the back of the pack), RUG to drop behind, ZAP homing on the
 * kart ahead, the 51% ATTACK on the leader, SHIELDED: untouchable, unstoppable for a while.
 *
 * Each kart knows its nearest sample of the track, its offset from the middle (the kerbs, the grass,
 * the barriers), its height (bridges, the jump, the canal under it: a kart that falls in splashes and
 * is put back) and its progress (laps). On a shortcut it rides a straight of its own, mapped onto the
 * road's progress. The ground can be slippery (ice: the kart slides on, its nose turning faster than
 * its path), wet (a little), or a puddle (it drags); gusts push karts across the road. A
 * minimum-curvature racing line guides the AIs (the boost pads sit on it); the good ones drift every
 * bend, aim for the pads and take the shortcut; a gentle rubber band keeps the pack together. The race
 * is over when you cross the line (the others placed where they are), or soon after the last AI.
 */
import * as THREE from "three";
import { T } from "../../../i18n/lang";
import { FONT, H, HUD, W, clamp, easeOut, fpx, grow, ord, rng, rr, shout, sfx, sound, text, token, zoom, type Input, type IntroShot, type Mini, type Player, type Rnd } from "../../kit";
import { Avatar, CamRig, Fx3, GEO, banner, blob, canvasTex, coin, disposeScene, qTex, short, skyDome, tag, toScreen, toonSteps, turn, world, yawOf } from "../../k3";
import { music } from "../../music";
import { touchy } from "../../hud";
import { actWord, actsOf } from "../../acts";
import { Kit, INK, roadPaint } from "./scenery";
import { CYL, Merge, STEP, Track, WATER, Z_CITY, Z_SHORT, type Patch } from "./track";
import type { Course, RaceCtx } from "./course";

const VMAX = 34;
const CAP = 170;
/** Gravity on a kart in the air. */
const G = 26;
const MAX_COINS = 10;
/** Mini-turbos by drift tier (blue, orange, purple): the charge it takes, how long, how strong. */
const TIER_AT = [0, 0.5, 1.15, 1.95];
const MT_T = [0, 0.55, 1.0, 1.5];
const MT_P = [1, 1.3, 1.4, 1.52];
const TIER_C = ["#ffffff", "#3ec6ff", "#ff9d1a", "#c45bff"];
const ROLL_T = 1.15;
type Item = "turbo" | "turbo3" | "rug" | "zap" | "attack" | "quantum";
const ITEMS: Item[] = ["turbo", "turbo3", "rug", "zap", "attack", "quantum"];
/** What a Z-Block gives by place (turbo, turbo×3, rug, zap, 51%, shielded: the `quantum` key). */
const DEAL: number[][] = [
  [0.3, 0, 0.55, 0.15, 0, 0],
  [0.34, 0.05, 0.3, 0.28, 0, 0.03],
  [0.28, 0.15, 0.15, 0.3, 0.05, 0.07],
  [0.2, 0.25, 0.05, 0.28, 0.09, 0.13],
];

// (colours for the particles, made once)
const C_FIRE = ["#ff9d1a", "#ffd23f", "#ffffff"];
const C_TIER = [["#ffffff", "#d0d0d8"], ["#3ec6ff", "#bfefff", "#ffffff"], ["#ff9d1a", "#ffd23f", "#ffffff"], ["#c45bff", "#f0c8ff", "#ffffff"]];
const C_SMOKE = ["#d8d8e4", "#ffffff", "#b9bccc"];
const C_DUST = ["#d9cbb0", "#c9b89a", "#efe6d4"];
const C_GRASS = ["#6aa83a", "#8a6a3a", "#9ad45a"];
const C_FROST = ["#ffffff", "#dff4ff", "#bfe6ff"];
const C_SPARK = ["#ffffff", "#ffd23f", "#9aa0b8"];
const C_WATER = ["#3fb4ff", "#bfefff", "#ffffff"];
const C_GOLD = ["#ffcf2e", "#fff4c4", "#ff9d1a"];
const C_COIN = ["#ffd23f", "#fff4c4"];
const C_ZAP = ["#7ff3ff", "#ffffff", "#3ec6ff"];
const C_BLAST = ["#ff3b5c", "#ffd23f", "#ffffff", "#ff9d1a"];
const C_PAD = ["#ff9d1a", "#fff36b", "#ffffff"];

// ---- the karts ----------------------------------------------------------------------------------

interface Kart {
  seat: number;
  p: Player;
  a: Avatar;
  tilt: THREE.Group;
  body: THREE.Group;
  aura: THREE.Mesh;
  x: number;
  z: number;
  y: number;
  vy: number;
  vyG: number;
  air: boolean;
  airT: number;
  trick: boolean;
  trickT: number;
  trickPlan: boolean;
  flip: number;
  bounce: number;
  bounceV: number;
  yaw: number;
  speed: number;
  steer: number;
  /** The road's sample, the offset right of its middle, the progress along the loop. */
  seg: number;
  lat: number;
  s: number;
  prog: number;
  lastS: number;
  /** On the plank (1) or the road (0); how far along the plank. */
  on: number;
  u: number;
  /** The way the ground runs here, and its height. */
  ftx: number;
  ftz: number;
  gnd: number;
  done: number;
  lapIdx: number;
  lapStart: number;
  laps: number[];
  drift: number;
  charge: number;
  tier: number;
  hop: number;
  slide: number;
  boost: number;
  boostP: number;
  boostC: number;
  /** A boost's punch (1 when one fires), for the camera. */
  kick: number;
  spin: number;
  spinA: number;
  stall: number;
  respawn: number;
  respawnAt: number;
  quantum: number;
  item: Item | null;
  itemN: number;
  roll: number;
  rollItem: Item;
  coins: number;
  draft: number;
  pace: number;
  skill: number;
  auto: boolean;
  lane: number;
  laneT: number;
  aimPads: boolean;
  useT: number;
  wrongT: number;
  wallT: number;
  angryT: number;
  aDown: boolean;
  bendSeen: boolean;
  willDrift: boolean;
  plan: boolean;
  planLap: number;
  skidT: number;
  puffT: number;
  kerbT: number;
  offT: number;
  wheelA: number;
  counterT: number;
  /** Its velocity (the path: on ice it lags the nose), the ground's grip, how long on ice, the patch under it. */
  vx: number;
  vz: number;
  grip: number;
  ice: number;
  puddleT: number;
  patch: Patch | null;
  st: { splash: number; plank: number; pads: number; mt: number[]; items: number; walls: number; rocket: number; tricks: number; where: number[] };
}

interface Ctrl {
  steer: number;
  brake: boolean;
  lift: boolean;
  drift: boolean;
  use: boolean;
}

/** Where the wheels sit on a kart's body (x, z), front first; how wide each tyre is. */
const WHEELS = [
  [-0.88, 0.85, 0.36],
  [0.88, 0.85, 0.36],
  [-0.9, -0.82, 0.46],
  [0.9, -0.82, 0.46],
];

const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const v3 = new THREE.Vector3();
const m4 = new THREE.Matrix4();
const m5 = new THREE.Matrix4();
const m6 = new THREE.Matrix4();
const q1 = new THREE.Quaternion();
const q2 = new THREE.Quaternion();
const q3 = new THREE.Quaternion();
const sc1 = new THREE.Vector3();
const col1 = new THREE.Color();
const UPV = new THREE.Vector3(0, 1, 0);
const XV = new THREE.Vector3(1, 0, 0);
const ZV = new THREE.Vector3(0, 0, 1);
const ZERO = new THREE.Vector3(0, 0, 0);
const TYRE_R = new THREE.Quaternion().setFromAxisAngle(ZV, Math.PI / 2);
const mm = new THREE.Matrix4();
const mq = new THREE.Quaternion();
const me = new THREE.Euler();
const mv = new THREE.Vector3();
const ms = new THREE.Vector3();
const xz = (v: THREE.Vector3): [number, number] => [v.x, v.z];
const xyz = (v: THREE.Vector3) => ({ x: v.x, y: v.y, z: v.z });

/** A patch's picture (64×128, along the road): ice (pale, glossy, cracked), a puddle (dark, shiny), a hole in the ice. */
function patchPaint(g: CanvasRenderingContext2D, kind: string, night: boolean) {
  const r = rng(kind.length * 977);
  g.clearRect(0, 0, 64, 128);
  const blob = (c: string, inset: number) => {
    g.fillStyle = c;
    g.beginPath();
    g.ellipse(32, 64, 32 - inset, 64 - inset, 0, 0, Math.PI * 2);
    g.fill();
  };
  if (kind === "ice") {
    blob("rgba(190,230,255,0.55)", 0);
    blob("rgba(225,245,255,0.75)", 5);
    g.strokeStyle = "rgba(255,255,255,0.95)";
    g.lineWidth = 1.5;
    for (let k = 0; k < 7; k++) {
      g.beginPath();
      let x = 12 + r() * 40,
        y = 14 + r() * 100;
      g.moveTo(x, y);
      for (let q = 0; q < 3; q++) g.lineTo((x += (r() - 0.5) * 22), (y += (r() - 0.5) * 30));
      g.stroke();
    }
    g.fillStyle = "rgba(255,255,255,0.9)";
    for (let k = 0; k < 6; k++) g.fillRect(8 + r() * 48, 10 + r() * 108, 3, 3);
  } else if (kind === "puddle") {
    blob(night ? "rgba(20,24,60,0.55)" : "rgba(40,60,90,0.45)", 0);
    blob(night ? "rgba(40,60,130,0.75)" : "rgba(70,110,160,0.6)", 6);
    g.strokeStyle = "rgba(200,230,255,0.6)";
    g.lineWidth = 1.5;
    for (let k = 0; k < 4; k++) {
      g.beginPath();
      g.ellipse(18 + r() * 28, 24 + r() * 80, 4 + r() * 6, 7 + r() * 9, 0, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = "rgba(255,255,255,0.35)";
    g.fillRect(14, 30, 4, 40);
  } else {
    // a hole in the ice: black water, a ring of broken white ice, warning orange
    blob("rgba(255,140,40,0.9)", 0);
    blob("rgba(240,250,255,1)", 4);
    blob("rgba(12,30,60,1)", 9);
    g.fillStyle = "rgba(60,120,180,0.8)";
    for (let k = 0; k < 5; k++) g.fillRect(20 + r() * 24, 30 + r() * 68, 6, 2);
  }
}

/** One options object for the frequent particle bursts (sparks, puffs, dust): no allocation per frame. */
const FXO = { speed: 0, up: 0, gravity: 18, size: 0.18, life: 0.9, drag: 0.6, dir: new THREE.Vector3() };
function fxo(speed: number, up: number, gravity: number, size: number, life: number, dx = 0, dy = 0, dz = 0) {
  FXO.speed = speed;
  FXO.up = up;
  FXO.gravity = gravity;
  FXO.size = size;
  FXO.life = life;
  FXO.dir.set(dx, dy, dz);
  return FXO;
}

/** A little synth note for the game's own sounds (the boost's roar, the drift's tiers). */
function beep(freq: number, dur: number, type: OscillatorType = "square", vol = 0.3, slide = 0) {
  const a = sound();
  if (!a) return;
  const t = a.ac.currentTime;
  const o = a.ac.createOscillator();
  const g = a.ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.bus);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export class KartRace implements Mini {
  private w: ReturnType<typeof world>;
  private trk: Track;
  private karts: Kart[];
  private order: number[] = [0, 1, 2, 3];
  private fx: Fx3;
  private cam: CamRig;
  private camYaw = 0;
  private camY = 0;
  private camBack = 6;
  private fovKick = 0;
  private roll = 0;
  private t = 0;
  private wall = 0;
  private phase: "card" | "count" | "play" = "card";
  private countK = 0;
  private over: number[] | null = null;
  private hurry = -1;
  private boxes: { i: number; d: number; on: number; u: number; x: number; y: number; z: number; off: number }[] = [];
  private boxMesh!: THREE.InstancedMesh;
  private boxInk!: THREE.InstancedMesh;
  private rugs: { m: THREE.Group; x: number; y: number; z: number; life: number; by: number }[] = [];
  private shots: { m: THREE.Mesh; i: number; d: number; to: number; life: number; big: boolean; by: number; x: number; y: number; z: number }[] = [];
  private pads: { s: number; d: number; on: number; u: number; y: number }[] = [];
  private padTex: THREE.Texture | null = null;
  private coins: { s: number; d: number; x: number; y: number; z: number; off: number }[] = [];
  private coinMesh: THREE.InstancedMesh | null = null;
  private skids!: THREE.InstancedMesh;
  private skidN = 0;
  private lights!: THREE.InstancedMesh;
  private kit: Kit;
  private water: THREE.Texture | null = null;
  private wind!: THREE.InstancedMesh;
  private windMat!: THREE.MeshBasicMaterial;
  private windP: Float32Array = new Float32Array(40 * 4);
  private tyres!: THREE.InstancedMesh;
  private hubs!: THREE.InstancedMesh;
  private flames!: THREE.InstancedMesh;
  private cores!: THREE.InstancedMesh;
  private glows!: THREE.InstancedMesh;
  private shadows!: THREE.InstancedMesh;
  private map: { path: Path2D; short: Path2D | null; deck: Path2D; x: number; y: number; k: number; cx: number; cz: number; w: number; h: number };
  private say = { s: "", c: "#ffd23f", t: 1, y: H * 0.62 };
  private finalT = 1;
  private warn = 0;
  private engine: { o: OscillatorNode; o2: OscillatorNode; o3: OscillatorNode; g: GainNode; g3: GainNode; f: BiquadFilterNode; nz: AudioBufferSourceNode; ng: GainNode } | null = null;
  private human: Kart | null;
  private lastPlace = -1;
  private placePop = 0;
  private placeDir = 0;
  private finalLap = false;
  private rocketAt = -1;
  private rocketHeld = false;
  private fireworks = -1;
  private coinPop = 0;
  private itemPop = 0;
  private lastRollTick = -1;
  // the HUD's speed lines: angle, radius, speed, length per streak
  private lines = new Float32Array(48 * 4);
  private lastDraw = 0;
  private grads: CanvasGradient[] | null = null;
  private ctrl: Ctrl = { steer: 0, brake: false, lift: false, drift: false, use: false };
  private hctrl: Ctrl = { steer: 0, brake: false, lift: false, drift: false, use: false };
  /** The gusts: warning 0..1, push 0..1, which way (across the road); the HUD's sock. */
  private gust = { warn: 0, k: 0, side: 1 };
  private ctx: RaceCtx;
  /** The track's name across the screen at GO. */
  private introT = 0;
  /** Off the road (grass, snow): the top speed's factor. */
  private offK: number;
  private splashC: string[];
  /** Water on the screen (a puddle's splash, the rain): 1 fresh, fading. */
  private drops = 0;
  /** Lightning's white over the screen. */
  private flashK = 0;

  constructor(
    private players: Player[],
    private rnd: Rnd,
    readonly course: Course,
  ) {
    const th = course.theme;
    this.offK = course.offK ?? 0.55;
    this.splashC = course.splash ?? C_WATER;
    this.w = world({ sky: th.sky, fog: th.fog, fov: 62, night: th.night });
    this.trk = new Track(course.spec);
    this.w.sun.position.set(...th.sun.pos);
    this.w.sun.color.set(th.sun.color);
    this.w.sun.intensity = th.sun.i;
    this.w.hemi.color.set(th.hemi.sky);
    this.w.hemi.groundColor.set(th.hemi.ground);
    this.w.hemi.intensity = th.hemi.i;
    this.w.camera.near = 0.3;
    this.w.camera.far = 1100;
    this.w.camera.updateProjectionMatrix();
    this.fx = new Fx3(this.w.scene, 1600);
    let seed = 4071;
    for (const ch of course.key) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    // the sky all round (the chase camera always sees the horizon), its sun where the light comes from
    // (under the horizon it is the fog's colour: the ground runs into it without a seam, seen from high up)
    skyDome(this.w.scene, { sky: th.sky, ground: th.sky[1], rnd: rng(seed ^ 0x51d0), ...th.dome });
    // (the chase camera sees far down the road: the shadows reach further than a top-down arena's)
    this.w.scene.userData.shadowR = th.shadowR ?? 2.2;
    if (th.shadowK !== undefined) this.w.scene.userData.shadowK = th.shadowK;
    this.kit = new Kit(this.w.scene, this.trk, th, rng(seed));
    this.build();
    // the grid, behind the line: the best rivals in front, you on the second row
    const humanSeat = players.findIndex((p) => p.human);
    const slots = [...players.keys()].filter((s) => s !== humanSeat).sort((a, b) => players[b].skill - players[a].skill);
    if (humanSeat >= 0) slots.splice(2, 0, humanSeat);
    this.karts = players.map((p) => this.makeKart(p, slots.indexOf(p.seat)));
    this.kartParts();
    this.human = this.karts.find((k) => k.p.human) ?? null;
    this.cam = new CamRig(this.w.camera);
    const k0 = this.human ?? this.karts[0];
    this.camYaw = k0.yaw;
    this.camY = k0.y + 2.4;
    this.chase(k0, 0, true);
    this.cam.apply(0);
    for (let i = 0; i < 48; i++) this.resetLine(i, true);
    // the mini-map: the circuit to scale in a box that fits it, the decks over the crossings drawn on top
    const tr = this.trk;
    const { x0, x1, z0, z1 } = tr.bounds;
    const k = Math.min(212 / (x1 - x0), 128 / (z1 - z0));
    const mw = (x1 - x0) * k + 24,
      mh = (z1 - z0) * k + 22;
    const cx = (x0 + x1) / 2,
      cz = (z0 + z1) / 2;
    const path = new Path2D();
    for (let i = 0; i <= tr.n; i += 4) {
      const j = i % tr.n;
      const X = (tr.px[j] - cx) * k,
        Y = (tr.pz[j] - cz) * k;
      if (i === 0) path.moveTo(X, Y);
      else path.lineTo(X, Y);
    }
    path.closePath();
    const deck = new Path2D();
    let inDeck = false;
    for (let i = 0; i <= tr.n; i += 2) {
      const j = i % tr.n;
      const on = tr.span[j] || (tr.py[j] > 4 && (tr.span[tr.wrap(j - 30)] || tr.span[tr.wrap(j + 30)]));
      if (on && !inDeck) deck.moveTo((tr.px[j] - cx) * k, (tr.pz[j] - cz) * k);
      else if (on) deck.lineTo((tr.px[j] - cx) * k, (tr.pz[j] - cz) * k);
      inDeck = !!on;
    }
    let short: Path2D | null = null;
    const P = tr.short;
    if (P) {
      short = new Path2D();
      short.moveTo((P.ax - cx) * k, (P.az - cz) * k);
      short.lineTo((P.ax + P.dx * P.len - cx) * k, (P.az + P.dz * P.len - cz) * k);
    }
    this.map = { path, short, deck, x: W - 16 - mw / 2, y: 14 + mh / 2, k, cx, cz, w: mw, h: mh };
    const self = this;
    this.ctx = {
      scene: this.w.scene,
      camera: this.w.camera,
      trk: tr,
      fx: this.fx,
      get t() {
        return self.t;
      },
      get wall() {
        return self.wall;
      },
      get focus() {
        return self.human ?? self.leader();
      },
      gust: this.gust,
      hemi: this.w.hemi,
      sun: this.w.sun,
      shake: (a: number) => this.cam.shake(a),
      flash: (a: number) => void (this.flashK = Math.max(this.flashK, a)),
      get playing() {
        return self.phase === "play";
      },
    };
    this.kit.ctx = this.ctx;
    // (the bench drives it from outside: scratchpad bots)
    if (typeof location !== "undefined" && location.pathname.includes("partylab")) (window as unknown as { __kart?: unknown }).__kart = this;
  }

  // ---- the circuit ----------------------------------------------------------------------------

  /** The road and everything on it (the same kit on every course), then the course's own scenery. */
  private build() {
    const s = this.w.scene;
    const tr = this.trk;
    const b = this.kit;
    const th = this.course.theme;
    const { plain, lit, ink } = b;
    const P = tr.short;
    const sd = P ? P.side : 0;
    const half = tr.half;
    const F = {
      kart: b.face(this.course.gantry[0], "#ffffff", "#ff6b35"),
      jump: b.face(T("JUMP!", "飞跃！"), "#15101f", "#ffd23f"),
      gap: b.face(T("MIND THE GAP", "小心缺口"), "#ffffff", "#ff3b5c"),
      short: b.face(T("SHORTCUT?", "捷径？"), "#15101f", "#ffd23f"),
    };
    // ---- the ground, with holes for the water
    const ground = canvasTex(256, 256, (g) => th.ground(g, 256), true);
    ground.repeat.set(1 / th.groundM, 1 / th.groundM);
    const shape = new THREE.Shape();
    shape.moveTo(-900, -900);
    shape.lineTo(900, -900);
    shape.lineTo(900, 900);
    shape.lineTo(-900, 900);
    shape.closePath();
    const pools: THREE.Vector2[][] = this.course.water?.(tr) ?? [];
    // (the canal across the road at the jump)
    if (tr.lip >= 0 && this.course.spec.jump!.gap > 0) {
      const J = this.course.spec.jump!;
      const gm = tr.wrap(tr.lip + J.gap / STEP / 2 + 1);
      const cl = 70,
        cw = J.gap + 0.2;
      const canal: THREE.Vector2[] = [];
      for (const [a, c] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        tr.at(gm, a * (cl / 2), 0, v1);
        v1.x += tr.tx[gm] * c * (cw / 2);
        v1.z += tr.tz[gm] * c * (cw / 2);
        canal.push(new THREE.Vector2(v1.x, -v1.z));
      }
      pools.push(canal);
      for (let d = -40; d <= 40; d += 8) b.clear(...xz(tr.at(gm, d)), 10);
    }
    for (const poly of pools) shape.holes.push(new THREE.Path(poly));
    const gg = new THREE.ShapeGeometry(shape);
    const gm = new THREE.Mesh(gg, new THREE.MeshToonMaterial({ map: ground, gradientMap: toonSteps() }));
    gm.rotation.x = -Math.PI / 2;
    gm.position.y = -0.1;
    s.add(gm);
    // the water in them, the banks round them
    if (pools.length) {
      // (painted on a 64 grid, drawn four times as sharp: hard-edged ripples, not a blur, close to the camera)
      this.water = canvasTex(256, 256, (g) => (g.scale(4, 4), th.water(g)), true);
      this.water.repeat.set(1 / th.waterM, 1 / th.waterM);
      const wm = new Merge();
      for (const poly of pools) {
        const sh = new THREE.Shape(poly);
        const sg = new THREE.ShapeGeometry(sh);
        m4.makeRotationX(-Math.PI / 2);
        m5.makeTranslation(0, th.waterY ?? WATER, 0);
        wm.add(sg, m5.multiply(m4), "#ffffff", [1, 1, 0, 0]);
        sg.dispose();
        for (let k = 0; k < poly.length; k++) {
          const a = poly[k],
            c = poly[(k + 1) % poly.length];
          const dx = c.x - a.x,
            dz = -(c.y - a.y);
          const l = Math.hypot(dx, dz);
          if (l < 0.01) continue;
          plain.box(th.bank, 0.5, 1.0, l + 0.2, (a.x + c.x) / 2, -0.55, -(a.y + c.y) / 2, Math.atan2(dx, dz));
        }
      }
      s.add(new THREE.Mesh(wm.build(), new THREE.MeshBasicMaterial({ map: this.water, vertexColors: true })));
    }
    // ---- the road's bed: the open verge, the town's pavements, the bridges' concrete; its sides
    const road = (i: number) => !tr.gap[i];
    const bed = (i: number, o: number[]) => ((o[0] = -tr.edge[i] - 1.5), (o[1] = -0.02), (o[2] = tr.edge[i] + 1.5), (o[3] = -0.02), road(i));
    s.add(new THREE.Mesh(tr.ribbon((i, o) => bed(i, o) && tr.zone[i] !== Z_CITY && tr.py[i] < 0.6, 10), toonM(th.bedOpen)));
    const paveTex = canvasTex(256, 256, (g) => (g.scale(4, 4), th.pave(g)), true);
    paveTex.repeat.set(4, 1);
    s.add(new THREE.Mesh(tr.ribbon((i, o) => bed(i, o) && tr.zone[i] === Z_CITY && tr.py[i] < 0.6, 4), new THREE.MeshToonMaterial({ map: paveTex, gradientMap: toonSteps() })));
    s.add(new THREE.Mesh(tr.ribbon((i, o) => bed(i, o) && tr.py[i] >= 0.6, 10), toonM(th.bedDeck)));
    // (the embankments: brick walls down to the ground; the deck's edge and underside where it spans)
    const brick = canvasTex(
      256,
      256,
      (g) => {
        g.scale(4, 4);
        g.fillStyle = th.brick[0];
        g.fillRect(0, 0, 64, 64);
        g.fillStyle = th.brick[1];
        for (let y = 0; y < 64; y += 16) for (let x = (y / 16) % 2 ? 16 : 0; x < 64; x += 32) g.fillRect(x, y, 30, 14);
      },
      true,
    );
    const brickMat = new THREE.MeshToonMaterial({ map: brick, side: THREE.DoubleSide, gradientMap: toonSteps() });
    for (const side of [-1, 1]) {
      s.add(
        new THREE.Mesh(
          tr.ribbon((i, o) => {
            const e = side * (tr.edge[i] + 1.5);
            o[0] = o[2] = e;
            o[1] = -0.02;
            o[3] = -tr.py[i] - 0.12;
            o[4] = Math.max(0.2, tr.py[i] / 2);
            return tr.py[i] > 0.03 && !tr.span[i] && road(i);
          }, 2),
          brickMat,
        ),
      );
      s.add(
        new THREE.Mesh(
          tr.ribbon((i, o) => {
            o[0] = o[2] = side * (tr.edge[i] + 1.5);
            o[1] = -0.02;
            o[3] = -1.3;
            return !!tr.span[i];
          }, 4),
          new THREE.MeshToonMaterial({ color: th.bedDeck, side: THREE.DoubleSide, gradientMap: toonSteps() }),
        ),
      );
    }
    s.add(new THREE.Mesh(tr.ribbon((i, o) => ((o[0] = tr.edge[i] + 1.5), (o[2] = -tr.edge[i] - 1.5), (o[1] = o[3] = -1.3), !!tr.span[i]), 4), toonM("#8d86a6")));
    // ---- the road: asphalt, its lines; kerbs in the bends, rumble strips on the straights
    const gritR = rng(0x70ad);
    const asphalt = canvasTex(512, 512, (g) => roadPaint(g, 512, th.road, gritR), true);
    asphalt.anisotropy = 8;
    const roadMat = th.wet ? new THREE.MeshPhongMaterial({ map: asphalt, shininess: 90, specular: new THREE.Color("#6a7aa8") }) : new THREE.MeshToonMaterial({ map: asphalt, gradientMap: toonSteps() });
    if (th.road.glow) {
      // (at night the lines glow a little, like reflective paint in the headlights: the road ahead reads at speed)
      const lines = canvasTex(256, 256, (g) => roadPaint(g, 256, th.road, gritR, true), true);
      roadMat.emissiveMap = lines;
      roadMat.emissive.set("#ffffff");
      roadMat.emissiveIntensity = th.road.glow;
    }
    s.add(new THREE.Mesh(tr.ribbon((i, o) => ((o[0] = -half), (o[2] = half), (o[1] = o[3] = 0.02), road(i)), 9), roadMat));
    const stripes = (a: string, c: string, h: number) =>
      canvasTex(
        8,
        h,
        (g) => {
          g.fillStyle = a;
          g.fillRect(0, 0, 8, h / 2);
          g.fillStyle = c;
          g.fillRect(0, h / 2, 8, h / 2);
        },
        true,
      );
    const kerbMat = new THREE.MeshToonMaterial({ map: stripes(th.kerb[0], th.kerb[1], 64), gradientMap: toonSteps() });
    const rumbleMat = new THREE.MeshToonMaterial({ map: stripes(th.rumble[0], th.rumble[1], 32), gradientMap: toonSteps() });
    const kerbG = new Merge(),
      rumbleG = new Merge();
    for (const side of [-1, 1]) {
      const kg = tr.ribbon((i, o) => ((o[0] = side < 0 ? -half - 1.3 : half), (o[2] = side < 0 ? -half : half + 1.3), (o[1] = o[3] = 0.06), road(i) && !!tr.kerb[i] && !(side === sd && tr.openS[i])), 2.4);
      kerbG.add(kg, m4.identity(), "#ffffff", [1, 1, 0, 0]);
      kg.dispose();
      const rg = tr.ribbon((i, o) => ((o[0] = side < 0 ? -half - 0.7 : half), (o[2] = side < 0 ? -half : half + 0.7), (o[1] = o[3] = 0.045), road(i) && !tr.kerb[i] && !tr.tunnel[i]), 1.2);
      rumbleG.add(rg, m4.identity(), "#ffffff", [1, 1, 0, 0]);
      rg.dispose();
    }
    s.add(new THREE.Mesh(kerbG.build(), kerbMat), new THREE.Mesh(rumbleG.build(), rumbleMat));
    // ---- the barriers: padded stripes in the open, the town's wall with posters; their caps
    const wallTex = canvasTex(
      256,
      32,
      (g) => {
        for (let i = 0; i < 4; i++) {
          g.fillStyle = th.wall[i % th.wall.length];
          g.fillRect(i * 64, 0, 64, 32);
        }
        g.fillStyle = "rgba(0,0,0,0.18)";
        g.fillRect(0, 26, 256, 6);
      },
      true,
    );
    const townTex = canvasTex(
      256,
      32,
      (g) => {
        g.fillStyle = th.town[0];
        g.fillRect(0, 0, 256, 32);
        const c = th.town[1];
        for (let i = 0; i < 4; i++) {
          g.fillStyle = c[i % c.length];
          g.fillRect(i * 64 + 8, 5, 46, 20);
          g.fillStyle = "rgba(255,255,255,0.7)";
          g.fillRect(i * 64 + 14, 10, 20, 4);
        }
        g.fillStyle = "rgba(0,0,0,0.16)";
        g.fillRect(0, 27, 256, 5);
      },
      true,
    );
    const wallG = new Merge(),
      townG = new Merge(),
      capG = new Merge();
    for (const side of [-1, 1]) {
      const keep = (i: number) => road(i) && !tr.tunnel[i] && !(side === sd && tr.openS[i]);
      const a = tr.ribbon((i, o) => ((o[0] = o[2] = side * tr.edge[i]), (o[1] = 0), (o[3] = 1.05), keep(i) && tr.zone[i] !== Z_CITY), 8);
      wallG.add(a, m4.identity(), "#ffffff", [1, 1, 0, 0]);
      a.dispose();
      const c0 = tr.ribbon((i, o) => ((o[0] = o[2] = side * tr.edge[i]), (o[1] = 0), (o[3] = 1.2), keep(i) && tr.zone[i] === Z_CITY), 8);
      townG.add(c0, m4.identity(), "#ffffff", [1, 1, 0, 0]);
      c0.dispose();
      const c = tr.ribbon((i, o) => ((o[0] = side * tr.edge[i] - 0.28), (o[2] = side * tr.edge[i] + 0.28), (o[1] = o[3] = tr.zone[i] === Z_CITY ? 1.2 : 1.05), keep(i)), 8);
      capG.add(c, m4.identity(), "#ffffff", [1, 1, 0, 0]);
      c.dispose();
    }
    const wallM = new THREE.MeshToonMaterial({ map: wallTex, side: THREE.DoubleSide, gradientMap: toonSteps() });
    const townM = new THREE.MeshToonMaterial({ map: townTex, side: THREE.DoubleSide, gradientMap: toonSteps() });
    if (th.night) {
      // (at night the barriers' stripes and posters glow a little: the track reads in the dark)
      wallM.emissive.set("#ffffff");
      wallM.emissiveMap = wallTex;
      wallM.emissiveIntensity = 0.35;
      townM.emissive.set("#ffffff");
      townM.emissiveMap = townTex;
      townM.emissiveIntensity = 0.45;
    }
    s.add(new THREE.Mesh(wallG.build(), wallM));
    s.add(new THREE.Mesh(townG.build(), townM));
    s.add(new THREE.Mesh(capG.build(), toonM(th.cap)));
    // ---- the start: the chequered line, the grid's boxes, the gantry with its lights
    const check = canvasTex(128, 16, (g) => {
      for (let x = 0; x < 16; x++)
        for (let y = 0; y < 2; y++) {
          g.fillStyle = (x + y) % 2 ? "#111" : "#fff";
          g.fillRect(x * 8, y * 8, 8, 8);
        }
    });
    const line = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: check }));
    line.rotation.set(-Math.PI / 2, 0, 0);
    line.scale.set(half * 2, 1.6, 1);
    const g0 = new THREE.Group();
    g0.position.copy(tr.at(0, 0, 0.05));
    g0.rotation.y = tr.ty[0];
    g0.add(line);
    s.add(g0);
    for (let slot = 0; slot < 4; slot++) {
      const i = tr.wrap(-8 / STEP - (Math.floor(slot / 2) * 6.5) / STEP);
      const d = slot % 2 ? 2.8 : -2.8;
      tr.at(i, d, 0.03, v1);
      plain.box("#ffffff", 2.2, 0.02, 0.18, v1.x + tr.tx[i] * 1.6, v1.y + 0.04, v1.z + tr.tz[i] * 1.6, tr.ty[i]);
      for (const e of [-1, 1]) plain.box("#ffffff", 0.18, 0.02, 1.4, v1.x - tr.tz[i] * e * 1.1 + tr.tx[i] * 1.0, v1.y + 0.04, v1.z + tr.tx[i] * e * 1.1 + tr.tz[i] * 1.0, tr.ty[i]);
    }
    {
      const i = 0;
      const y0 = tr.ty[i];
      const e = tr.edge[i];
      const gy = tr.py[i];
      const at = (lx: number, lz: number) => tr.at(i, lx, 0, v1).add(v2.set(tr.tx[i] * lz, 0, tr.tz[i] * lz));
      for (const side of [-1, 1]) {
        at(side * (e + 0.3), 0);
        b.inked("#2b2f4a", 1.1, 8.4, 1.1, v1.x, gy + 4.2, v1.z, y0);
        b.inked("#ff6b35", 1.5, 0.6, 1.5, v1.x, gy + 8.6, v1.z, y0);
      }
      at(0, 0);
      b.inked("#2b2f4a", e * 2 + 1.6, 1.9, 1.0, v1.x, gy + 7.6, v1.z, y0);
      b.sign(F.kart, v1.x - tr.tx[i] * 0.53, gy + 7.6, v1.z - tr.tz[i] * 0.53, y0 + Math.PI, 1.6, false);
      b.sign(F.kart, v1.x + tr.tx[i] * 0.53, gy + 7.6, v1.z + tr.tz[i] * 0.53, y0, 1.6, false);
      // (the lights' housing: three lamps lit by the countdown)
      at(0, -0.6);
      plain.box("#1a1b2c", 4.6, 1.4, 0.5, v1.x, gy + 5.9, v1.z, y0);
      this.lights = new THREE.InstancedMesh(GEO.ball, new THREE.MeshBasicMaterial({ color: "#ffffff" }), 3);
      for (let k = 0; k < 3; k++) {
        at((k - 1) * 1.4, -0.9);
        this.lights.setMatrixAt(k, m4.compose(v3.set(v1.x, gy + 5.9, v1.z), q1.identity(), sc1.setScalar(0.85)));
        this.lights.setColorAt(k, col1.set("#3a1d1d"));
      }
      s.add(this.lights);
      for (let k = -4; k <= 4; k++) {
        at(k * 2.4, 0);
        plain.box(["#ff6b35", "#3ec6ff", "#8ee35b", "#ff5fa2", "#ffd23f"][(k + 9) % 5], 0.06, 0.9, 1.1, v1.x, gy + 9.2, v1.z, y0 + Math.PI / 2);
        if (th.night) b.glow(v1.x, gy + 8.7, v1.z, "#ffffff");
      }
      if (th.night) for (let k = -1; k <= 1; k++) (at(k * 1.4, -0.9), b.glow(v1.x, gy + 5.9, v1.z, "#ff5a3a"));
    }
    // ---- the tunnel: its walls, its roof, the strip lights that flash past
    const tun = tr.range(tr.tunnel);
    if (tun) {
      const inT = (i: number) => !!tr.tunnel[i];
      const tw = canvasTex(
        64,
        64,
        (g) => {
          g.fillStyle = "#3a3557";
          g.fillRect(0, 0, 64, 64);
          g.fillStyle = "#4a4470";
          g.fillRect(0, 0, 64, 6);
          g.fillStyle = "#7ff3ff";
          g.fillRect(0, 30, 64, 4);
          g.fillStyle = "#ff5fa2";
          g.fillRect(0, 46, 32, 3);
        },
        true,
      );
      const twm = new Merge();
      for (const side of [-1, 1]) {
        const g = tr.ribbon((i, o) => ((o[0] = o[2] = side * tr.edge[i]), (o[1] = 0), (o[3] = 7.5), inT(i)), 6);
        twm.add(g, m4.identity(), "#ffffff", [1, 1, 0, 0]);
        g.dispose();
      }
      s.add(new THREE.Mesh(twm.build(), new THREE.MeshToonMaterial({ map: tw, side: THREE.DoubleSide, gradientMap: toonSteps(), emissive: "#140f26" })));
      s.add(new THREE.Mesh(tr.ribbon((i, o) => ((o[0] = -tr.edge[i] - 0.1), (o[2] = tr.edge[i] + 0.1), (o[1] = o[3] = 7.5), inT(i)), 6), new THREE.MeshToonMaterial({ color: "#2c2846", side: THREE.DoubleSide, gradientMap: toonSteps() })));
      for (let k = 0; k < tun.cnt; k += 8) {
        const i = tr.wrap(tun.first + k);
        for (const d of [-4, 4]) {
          tr.at(i, d, 7.35, v1);
          lit.box("#fff1c9", 0.5, 0.12, 2.2, v1.x, v1.y, v1.z, tr.ty[i]);
        }
        for (const side of [-1, 1]) {
          tr.at(i, side * (tr.edge[i] - 0.06), 2.2, v1);
          lit.box(k % 16 ? "#7ff3ff" : "#ff5fa2", 0.08, 0.3, 1.6, v1.x, v1.y, v1.z, tr.ty[i]);
        }
      }
      for (let i = 0; i < tr.n; i += 10) if (tr.tunnel[i]) b.clear(tr.px[i], tr.pz[i], 26);
    }
    // ---- the jump: the kicker's arrows and stripes, its lip, the canal's far bank, the arch before it
    if (tr.lip >= 0) {
      const J = this.course.spec.jump!;
      const lip = tr.lip;
      const y0 = tr.ty[lip];
      const e = tr.edge[lip];
      tr.at(lip, 0, 0, v1);
      const ly = tr.py[tr.wrap(lip - 1)];
      for (let k = -8; k <= 8; k++) {
        const x = v1.x - tr.tz[lip] * k * 1.25,
          z = v1.z + tr.tx[lip] * k * 1.25;
        plain.box(k % 2 ? "#2b2f4a" : "#ffd23f", 1.25, ly + 0.1, 0.5, x - tr.tx[lip] * 0.25, (ly - 0.1) / 2, z - tr.tz[lip] * 0.25, y0);
      }
      ink.box(INK, e * 2 + 3.2, ly + 0.2, 0.62, v1.x - tr.tx[lip] * 0.25, (ly - 0.1) / 2, v1.z - tr.tz[lip] * 0.25, y0);
      if (J.gap > 0) {
        tr.at(tr.land, 0, 0, v1);
        plain.box(th.bank, e * 2 + 3, 1.0, 0.6, v1.x, -0.5, v1.z, y0);
        const gmid = tr.wrap(lip + J.gap / STEP / 2 + 1);
        for (const side of [-1, 1]) {
          tr.at(gmid, side * (e + 4), 0, v1);
          plain.box("#2b2f4a", 0.2, 2.6, 0.2, v1.x, 1.3, v1.z, y0);
          b.sign(F.gap, v1.x, 2.4, v1.z, y0 + Math.PI, 0.7, true);
        }
      }
      for (const f of [0.3, 0.65]) {
        const i = tr.wrap(lip - (J.len / STEP) * (1 - f));
        for (let k = -1; k <= 1; k++) {
          tr.at(i, k * 3.6, 0.07, v1);
          b.arrow(plain, v1.x, v1.y, v1.z, tr.ty[i], 2.4, "#ffd23f");
        }
      }
      b.arch(tr.wrap(lip - (J.len + 22) / STEP), F.jump, "#ffd23f", th.night);
    }
    // ---- the shortcut: arrows toward its gap, a sign at the fork
    if (P) {
      const i = tr.wrap(P.iA - 26 / STEP);
      tr.at(i, sd * (tr.edge[i] + 1.2), 0, v1);
      plain.box("#2b2f4a", 0.2, 3.2, 0.2, v1.x, v1.y + 1.6, v1.z, tr.ty[i]);
      b.sign(F.short, v1.x, v1.y + 3.2, v1.z, tr.ty[i] + Math.PI, 1.0, true);
      if (th.night) b.glow(v1.x, v1.y + 3.2, v1.z, "#ffd23f", true);
      const yaw = Math.atan2(P.dx, P.dz);
      for (let k = 0; k < 4; k++) {
        tr.at(tr.wrap(P.iA - (14 - k * 4) / STEP), sd * (half - 1.5 - k * 0.4), 0.07, v1);
        b.arrow(plain, v1.x, v1.y, v1.z, yaw, 2.2, "#ffd23f");
      }
      for (let u = 0; u < P.len; u += 8) b.clear(P.ax + P.dx * u, P.az + P.dz * u, P.kind === "wall" ? P.half + 1.5 : 14);
    }
    // ---- the patches: ice, puddles, holes in the ice
    this.patchMeshes();
    // ---- the Z-Blocks: rows across the road (and one on the shortcut)
    const spec = this.course.spec;
    for (const at of spec.boxes) {
      const i = tr.at0(at);
      const w = half - 1.7;
      for (const d of [-w, -w / 3, w / 3, w]) this.boxes.push({ i, d, on: 0, u: 0, ...xyz(tr.at(i, d, 1.25)), off: 0 });
    }
    if (P) {
      const u = (P.u1 + P.u2) / 2 + 10;
      tr.onShort(u, 0, v1);
      this.boxes.push({ i: tr.wrap(P.iA + (u / P.len) * P.di), d: 0, on: 1, u, x: v1.x, y: 1.25, z: v1.z, off: 0 });
    }
    this.boxMesh = new THREE.InstancedMesh(GEO.box, new THREE.MeshToonMaterial({ map: qTex(), gradientMap: toonSteps(), emissive: th.night ? 0x6a4a10 : 0x3a2600 }), this.boxes.length);
    this.boxInk = new THREE.InstancedMesh(GEO.box, new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }), this.boxes.length);
    this.boxMesh.frustumCulled = this.boxInk.frustumCulled = false;
    s.add(this.boxMesh, this.boxInk);
    if (th.night) for (const bx of this.boxes) b.glow(bx.x, bx.y, bx.z, "#ffcf4a");
    // ---- the boost pads: on the racing line (and on the kicker, down the shortcut)
    const chev = canvasTex(
      64,
      64,
      (g) => {
        g.fillStyle = "#ff8a1a";
        g.fillRect(0, 0, 64, 64);
        g.fillStyle = "#fff36b";
        g.beginPath();
        g.moveTo(6, 52);
        g.lineTo(32, 18);
        g.lineTo(58, 52);
        g.lineTo(44, 52);
        g.lineTo(32, 36);
        g.lineTo(20, 52);
        g.closePath();
        g.fill();
      },
      true,
    );
    chev.repeat.set(1, 3);
    this.padTex = chev;
    const padM = new THREE.InstancedMesh(GEO.plane, new THREE.MeshBasicMaterial({ map: chev, polygonOffset: true, polygonOffsetFactor: -2 }), spec.pads.length + 2);
    let pn = 0;
    const putPad = (x: number, y: number, z: number, yaw: number, pitch = 0) => {
      q1.setFromAxisAngle(UPV, yaw).multiply(q2.setFromAxisAngle(XV, -Math.PI / 2 - pitch)).multiply(q3.setFromAxisAngle(ZV, Math.PI));
      padM.setMatrixAt(pn++, m4.compose(v3.set(x, y, z), q1, sc1.set(3.6, 7, 1)));
    };
    for (const at of spec.pads) {
      const i = tr.at0(at);
      const d = clamp(tr.line[i], -half + 2, half - 2);
      tr.at(i, d, 0.06, v1);
      putPad(v1.x, v1.y, v1.z, tr.ty[i], Math.atan2(tr.py[tr.wrap(i + 2)] - tr.py[tr.wrap(i - 2)], 2));
      this.pads.push({ s: tr.s[i], d, on: 0, u: 0, y: tr.py[i] });
      if (th.night) b.pool(v1.x, v1.y + 0.03, v1.z, tr.ty[i], 6, 10, "#ff9d1a");
    }
    if (tr.lip >= 0 && spec.padJump) {
      const i = tr.wrap(tr.lip - 7 / STEP);
      tr.at(i, 0, 0.06, v1);
      putPad(v1.x, v1.y, v1.z, tr.ty[i], Math.atan2(tr.py[tr.wrap(i + 2)] - tr.py[tr.wrap(i - 2)], 2));
      this.pads.push({ s: tr.s[i], d: 0, on: 0, u: 0, y: tr.py[i] });
    }
    if (P && spec.padShort) {
      const u = P.w1 + 6;
      tr.onShort(u, 0, v1);
      putPad(v1.x, 0.08, v1.z, Math.atan2(P.dx, P.dz));
      this.pads.push({ s: 0, d: 0, on: 1, u, y: 0 });
    }
    padM.count = pn;
    s.add(padM);
    // ---- the ⓩ coins: lines of five on the line (six down the shortcut)
    for (const at of spec.coins) {
      const i0 = tr.at0(at);
      for (let c = 0; c < 5; c++) {
        const j = tr.wrap(i0 + (c * 3.2) / STEP);
        const d = clamp(tr.line[j], -half + 1, half - 1);
        const p = tr.at(j, d, 0.9);
        this.coins.push({ s: tr.s[j], d, x: p.x, y: p.y, z: p.z, off: 0 });
      }
    }
    if (P)
      for (let c = 0; c < 6; c++) {
        const u = P.w1 + 22 + c * 3.4;
        tr.onShort(u, 0, v1);
        this.coins.push({ s: -1, d: 0, x: v1.x, y: 0.9, z: v1.z, off: 0 });
      }
    const proto = coin(0.42).children[0] as THREE.Mesh;
    this.coinMesh = new THREE.InstancedMesh(proto.geometry, proto.material, this.coins.length);
    this.coinMesh.frustumCulled = false;
    s.add(this.coinMesh);
    // ---- the skid marks (a ring of dark quads on the road), the wind streaks
    this.skids = new THREE.InstancedMesh(GEO.plane, new THREE.MeshBasicMaterial({ color: th.night ? "#0c0c14" : "#26262e", transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }), 700);
    this.skids.count = 0;
    this.skids.frustumCulled = false;
    this.skids.renderOrder = 1;
    s.add(this.skids);
    this.windMat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.wind = new THREE.InstancedMesh(GEO.box, this.windMat, 40);
    this.wind.frustumCulled = false;
    s.add(this.wind);
    // ---- the course's own: landmarks, the city, signs, stands; then the skyline, the clouds
    for (const m of this.course.marks ?? []) b.clear(m[0], m[1], m[2]);
    this.course.scenery(b);
    b.skyline();
    b.clouds();
    b.finish();
  }

  /** The patches on the ground: ice (pale and glossy), puddles (dark and shiny), holes in the ice (black water). */
  private patchMeshes() {
    const tr = this.trk;
    const kinds: Record<string, Merge> = {};
    for (const p of tr.patches) {
      const m = (kinds[p.kind] ??= new Merge());
      const y = p.kind === "hole" ? 0.035 : 0.05;
      if (p.on) {
        tr.onShort(p.s, p.d0, v1);
        tr.onShort(p.s, p.d1, v2);
        tr.onShort(p.s + p.len, p.d1, v3);
        const d = tr.onShort(p.s + p.len, p.d0, new THREE.Vector3());
        m.quad([v1.x, y, v1.z], [v2.x, y, v2.z], [v3.x, y, v3.z], [d.x, y, d.z], 0, 0, 1, 1);
        continue;
      }
      // (along the road: a strip of quads following its curve)
      const i0 = tr.wrap((p.s / tr.L) * tr.n);
      const steps = Math.max(1, Math.round(p.len / 2));
      for (let k = 0; k < steps; k++) {
        const a = tr.wrap(i0 + (k * p.len) / steps / STEP),
          c = tr.wrap(i0 + ((k + 1) * p.len) / steps / STEP);
        tr.at(a, p.d0, y, v1);
        tr.at(a, p.d1, y, v2);
        tr.at(c, p.d1, y, v3);
        const d = tr.at(c, p.d0, y, new THREE.Vector3());
        // (counter-clockwise from above: d0 is left of d1)
        m.quad([v2.x, v2.y, v2.z], [v1.x, v1.y, v1.z], [d.x, d.y, d.z], [v3.x, v3.y, v3.z], 1, k / steps, 0, (k + 1) / steps);
      }
    }
    for (const [kind, m] of Object.entries(kinds)) {
      const tex = canvasTex(64, 128, (g) => patchPaint(g, kind, this.course.theme.night));
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(m.build(), mat);
      mesh.renderOrder = 1;
      this.w.scene.add(mesh);
    }
  }

  private makeKart(p: Player, slot: number): Kart {
    const s = this.w.scene;
    const a = new Avatar(s, p, { ring: false, shadow: false });
    const tilt = new THREE.Group();
    a.root.add(tilt);
    const body = new THREE.Group();
    tilt.add(body);
    // the kart: a chunky voxel go-kart in the seat's colour (one draw, its ink another)
    const km = new Merge(),
      ki = new Merge();
    const dark = p.dark;
    const part = (c: THREE.ColorRepresentation, w: number, h: number, d: number, x: number, y: number, z: number, t = 0, rx = 0) => {
      km.box(c, w, h, d, x, y, z, 0, rx);
      if (t) ki.box(0x15101f, w + 2 * t, h + 2 * t, d + 2 * t, x, y, z, 0, rx);
    };
    part(p.color, 1.5, 0.42, 2.3, 0, 0.5, 0, 0.05);
    part("#ffffff", 0.34, 0.03, 2.0, 0, 0.72, 0.05);
    part("#ffffff", 1.1, 0.26, 0.6, 0, 0.5, 1.3, 0.04);
    part("#fff3a0", 0.22, 0.12, 0.05, -0.36, 0.52, 1.61);
    part("#fff3a0", 0.22, 0.12, 0.05, 0.36, 0.52, 1.61);
    part(dark, 1.7, 0.2, 0.3, 0, 0.36, 1.55, 0.03);
    part(dark, 1.7, 0.22, 0.3, 0, 0.38, -1.25, 0.03);
    for (let sd = -1; sd <= 1; sd += 2) part(dark, 0.3, 0.34, 1.3, sd * 0.86, 0.42, 0, 0.03);
    part(dark, 0.95, 0.7, 0.22, 0, 1.0, -0.78, 0.04);
    part("#3a3d55", 0.8, 0.34, 0.5, 0, 0.82, -1.02, 0.03);
    part(p.color, 1.7, 0.12, 0.45, 0, 1.36, -1.12, 0.04);
    for (let sd = -1; sd <= 1; sd += 2) part("#2b2f4a", 0.1, 0.5, 0.1, sd * 0.55, 1.08, -1.12);
    for (let sd = -1; sd <= 1; sd += 2) part(p.color, 0.08, 0.36, 0.5, sd * 0.86, 1.2, -1.12, 0.02);
    // (the steering wheel, its column)
    part("#1d1d2a", 0.5, 0.08, 0.08, 0, 0.98, 0.42, 0, -0.9);
    part("#1d1d2a", 0.08, 0.08, 0.3, 0, 0.98, 0.42, 0, -0.9);
    part("#2b2f4a", 0.08, 0.45, 0.08, 0, 0.78, 0.55, 0, -0.9);
    for (let sd = -1; sd <= 1; sd += 2) {
      me.set(Math.PI / 2, 0, 0);
      km.add(CYL, mm.compose(mv.set(sd * 0.4, 0.62, -1.38), mq.setFromEuler(me), ms.set(0.22, 0.4, 0.22)), "#9aa0b8");
    }
    const kartMat = (this.kartMat ??= new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonSteps() }));
    const inkMat = (this.inkMat ??= new THREE.MeshBasicMaterial({ color: 0x15101f, side: THREE.BackSide }));
    body.add(new THREE.Mesh(km.build(), kartMat), new THREE.Mesh(ki.build(), inkMat));
    // SHIELDED's aura
    const aura = new THREE.Mesh(GEO.ball, new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }));
    aura.scale.set(3.2, 2.6, 4);
    aura.position.y = 0.9;
    aura.visible = false;
    tilt.add(aura);
    // the driver, seated, hands on the wheel
    tilt.add(a.body.root);
    a.body.root.position.set(0, 0.6, -0.22);
    a.body.puppet.motion.sit = 0.35;
    a.body.holdArms(true);
    a.legs = 0;
    if (p.human) a.marker?.removeFromParent();
    // on the grid
    const tr = this.trk;
    const row = Math.floor(slot / 2);
    const i = tr.wrap(-8 / STEP - (row * 6.5) / STEP);
    const d = slot % 2 ? 2.8 : -2.8;
    const at = tr.at(i, d);
    const k: Kart = {
      seat: p.seat,
      p,
      a,
      tilt,
      body,
      aura,
      x: at.x,
      z: at.z,
      y: at.y,
      vy: 0,
      vyG: 0,
      air: false,
      airT: 0,
      trick: false,
      trickT: 0,
      trickPlan: false,
      flip: 0,
      bounce: 0,
      bounceV: 0,
      yaw: tr.ty[i],
      speed: 0,
      steer: 0,
      seg: i,
      lat: d,
      s: tr.s[i],
      prog: tr.s[i] - tr.L,
      lastS: tr.s[i],
      on: 0,
      u: 0,
      ftx: tr.tx[i],
      ftz: tr.tz[i],
      gnd: 0,
      done: -1,
      lapIdx: -1,
      lapStart: 0,
      laps: [],
      drift: 0,
      charge: 0,
      tier: 0,
      hop: 0,
      slide: 0,
      boost: 0,
      boostP: 1,
      boostC: 0,
      kick: 0,
      spin: 0,
      spinA: 0,
      stall: 0,
      respawn: 0,
      respawnAt: 0,
      quantum: 0,
      item: null,
      itemN: 0,
      roll: 0,
      rollItem: "turbo",
      coins: 0,
      draft: 0,
      pace: p.human ? 1 : (0.9 + 0.085 * p.skill) * (tr.spec.aiPace ?? 1),
      skill: p.skill,
      auto: !p.human,
      lane: d,
      laneT: 0,
      aimPads: false,
      useT: 0,
      wrongT: 0,
      wallT: 0,
      angryT: 0,
      aDown: false,
      bendSeen: false,
      willDrift: false,
      plan: false,
      planLap: -9,
      skidT: 0,
      puffT: Math.random() * 0.1,
      kerbT: 0,
      offT: 0,
      wheelA: 0,
      counterT: 0,
      vx: 0,
      vz: 0,
      grip: 1,
      ice: 0,
      puddleT: 0,
      patch: null,
      st: { splash: 0, plank: 0, pads: 0, mt: [0, 0, 0, 0], items: 0, walls: 0, rocket: 0, tricks: 0, where: [] },
    };
    return k;
  }
  private kartMat: THREE.MeshToonMaterial | null = null;
  private inkMat: THREE.MeshBasicMaterial | null = null;

  /** The karts' moving parts, all four in a few instanced draws: tyres, hubs, flames, drift glows, shadows. */
  private kartParts() {
    const s = this.w.scene;
    const n = this.karts.length;
    this.tyres = new THREE.InstancedMesh(GEO.cyl, new THREE.MeshToonMaterial({ color: "#22222e", gradientMap: toonSteps() }), n * 4);
    this.hubs = new THREE.InstancedMesh(GEO.box, new THREE.MeshToonMaterial({ color: "#d8d8e4", gradientMap: toonSteps() }), n * 4);
    const add = () => new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.flames = new THREE.InstancedMesh(GEO.cone, add(), n * 2);
    this.cores = new THREE.InstancedMesh(GEO.cone, add(), n * 2);
    this.glows = new THREE.InstancedMesh(GEO.ball, add(), n * 2);
    const sh = blob(1);
    this.shadows = new THREE.InstancedMesh(GEO.plane, sh.material as THREE.Material, n);
    this.shadows.renderOrder = 2;
    for (const m of [this.tyres, this.hubs, this.flames, this.cores, this.glows, this.shadows]) {
      m.frustumCulled = false;
      s.add(m);
    }
    for (let i = 0; i < n * 2; i++) (this.flames.setColorAt(i, col1.set("#ff8a1a")), this.cores.setColorAt(i, col1.set("#fff3a0")), this.glows.setColorAt(i, col1.set("#3ec6ff")));
    for (const k of this.karts) this.pose(k, 0);
    this.syncParts(0);
  }

  // ---- the race -------------------------------------------------------------------------------

  /** The intro cinematic's shots (host.ts → cine.ts): high over the course, a flying run down the road from the line, the grid. */
  intro(): IntroShot[] {
    const tr = this.trk;
    const o = this.course.orbit ?? { x: (tr.bounds.x0 + tr.bounds.x1) / 2, z: (tr.bounds.z0 + tr.bounds.z1) / 2, r: 120, h: 62 };
    const road = (m: number, d = 0, up = 0): [number, number, number] => {
      const p = tr.at(m / STEP, d, up, v1);
      return [p.x, p.y, p.z];
    };
    const a0 = 1.85,
      a1 = 2.45;
    const run = [30, 60, 90, 120];
    return [
      { eye: [o.x + Math.sin(a0) * o.r * 1.1, o.h * 1.3, o.z + Math.cos(a0) * o.r * 0.9], eye2: [o.x + Math.sin(a1) * o.r * 0.85, o.h * 0.8, o.z + Math.cos(a1) * o.r * 0.7], at: [o.x, 0, o.z], at2: [o.x, 6, o.z], fov: 50, fov2: 46, w: 1.1 },
      { eye: road(4, 0, 4.6), via: run.map((m) => road(m, 0, 4.2)), eye2: road(150, 0, 3.8), at: road(30, 0, 1.6), atVia: run.map((m) => road(m + 26, 0, 1.6)), at2: road(176, 0, 1.6), fov: 60, fov2: 54, w: 1.6 },
      { eye: road(9, 0.6, 2.5), eye2: road(6, 0.3, 2.1), at: road(-11, 0, 1.1), at2: road(-11, 0, 0.9), fov: 46, fov2: 42, cast: true },
    ];
  }

  idle(dt: number, phase: "card" | "count", k: number, input?: Input) {
    this.wall += dt;
    this.phase = phase;
    const tr = this.trk;
    if (phase === "card") {
      // a slow flight round the course's heart
      const o = this.course.orbit ?? { x: (tr.bounds.x0 + tr.bounds.x1) / 2, z: (tr.bounds.z0 + tr.bounds.z1) / 2, r: 120, h: 62 };
      const a = 2.4 + k * 0.13;
      v1.set(o.x + Math.sin(a) * o.r, o.h - Math.min(14, k * 2), o.z + Math.cos(a) * o.r * 0.8);
      v2.set(o.x, 4, o.z);
      if (k < 0.05) this.cam.set(v1, v2);
      else this.cam.to(v1, v2, dt, 2);
      this.cam.apply(dt);
    } else {
      this.countK = k;
      const me = this.human ?? this.karts[0];
      if (k < 0.04 && this.cam.eye.distanceTo(v1.set(me.x, me.y, me.z)) > 40) this.cam.set(tr.at(me.seg - 30, 0, 14), tr.at(me.seg, 0, 1));
      this.chase(me, dt, false, 1.2 + k * 6);
      this.cam.apply(dt);
      const lit = k >= 2 / 3 ? 3 : k >= 1 / 3 ? 2 : 1;
      for (let i = 0; i < 3; i++) this.lights.setColorAt(i, col1.set(i < lit ? "#ff2a2a" : "#3a1d1d"));
      if (this.lights.instanceColor) this.lights.instanceColor.needsUpdate = true;
      // the rocket start: when A went down, and whether it still is
      if (input) {
        if (input.pressed("a") && this.rocketAt < 0) this.rocketAt = k;
        if (!input.held("a")) this.rocketAt = -1;
        this.rocketHeld = input.held("a");
        if (this.human && this.rocketHeld && Math.random() < 0.35) this.fx.burst(v1.set(me.x - Math.sin(me.yaw) * 1.6, me.y + 0.55, me.z - Math.cos(me.yaw) * 1.6), 1, C_SMOKE, fxo(0.8, 1.4, -2, 0.13, 0.5));
      }
    }
    for (const kt of this.karts) this.pose(kt, dt);
    this.syncParts(dt);
    this.spinProps(dt);
    this.course.tick?.(this.ctx, dt);
    this.fx.update(dt);
  }

  update(dt: number, input: Input) {
    if (this.t === 0) this.start();
    this.phase = "play";
    this.t += dt;
    this.wall += dt;
    const hc = this.hctrl;
    hc.steer = input.axis().x;
    hc.brake = input.held("down");
    hc.lift = false;
    hc.drift = input.held("a");
    const use = input.pressed("b");
    const subs = Math.max(1, Math.ceil(dt / (1 / 60)));
    const h = dt / subs;
    this.gustTick();
    this.rank();
    for (let n = 0; n < subs; n++) {
      for (const k of this.karts) {
        let c: Ctrl;
        if (k.auto) c = this.ai(k, h);
        else ((hc.use = n === 0 && use), (c = hc));
        this.drive(k, h, c);
      }
      this.bump(h);
      this.moveShots(h);
    }
    this.rank();
    for (const k of this.karts) this.pose(k, dt);
    this.syncParts(dt);
    this.spinProps(dt);
    this.fireworksTick(dt);
    this.fx.update(dt);
    const focus = this.human ?? this.leader();
    this.chase(focus, dt, false);
    this.cam.apply(dt);
    this.w.camera.rotateZ(this.roll);
    this.w.camera.updateMatrixWorld();
    this.windTick(focus);
    this.course.tick?.(this.ctx, dt);
    this.engineTone();
    this.checkEnd(dt);
    this.introT += dt;
    this.drops = Math.max(0, this.drops - dt * 0.8);
    this.say.t += dt / 1.6;
    this.finalT += dt / 2.2;
    this.warn = Math.max(0, this.warn - dt);
    this.placePop = Math.max(0, this.placePop - dt * 2.5);
    this.coinPop = Math.max(0, this.coinPop - dt * 4);
    this.itemPop = Math.max(0, this.itemPop - dt * 3);
  }

  /** The gusts: calm, a warning (the snow starts to blow across), then a push; the other way next time. */
  private gustTick() {
    const W0 = this.trk.spec.wind;
    if (!W0) return;
    const g = this.gust;
    const ph = (this.t + W0.every * 0.35) % W0.every;
    const g0 = W0.every - W0.len;
    const was = g.k;
    g.warn = ph > g0 - W0.warn && ph < g0 ? (ph - (g0 - W0.warn)) / W0.warn : 0;
    g.k = ph >= g0 ? Math.min(1, (ph - g0) / 0.35, (W0.every - ph) / 0.5) : 0;
    const n = Math.floor((this.t + W0.every * 0.35) / W0.every);
    g.side = W0.side * (n % 3 === 2 ? -1 : 1);
    const me = this.human;
    if (me && this.trk.windy[me.seg] && me.done < 0) {
      if (was <= 0 && g.k > 0) (this.shout(T("GUST!", "阵风！"), "#bfefff", H * 0.36), sfx.whoosh(), this.cam.shake(0.2));
    }
  }

  /** GO: the lights go green, the engines roar, the rocket starts fire. */
  private start() {
    for (let i = 0; i < 3; i++) this.lights.setColorAt(i, col1.set("#38ff5a"));
    if (this.lights.instanceColor) this.lights.instanceColor.needsUpdate = true;
    this.startEngine();
    for (const k of this.karts) {
      if (k.p.human) {
        // (A went down on the "1" and is still held: a rocket; a beat late: a good start; too early: a stall)
        if (this.rocketHeld && this.rocketAt >= 0.62 && this.rocketAt < 0.95) this.rocket(k, true);
        else if (this.rocketHeld && this.rocketAt >= 0.95) this.rocket(k, false);
        else if (this.rocketHeld && this.rocketAt >= 0) {
          k.stall = 0.9;
          this.shout(T("TOO EARLY!", "太早了！"), "#ff8a8a");
          sfx.lose();
        }
      } else if (this.rnd() < 0.15 + k.skill * 0.65) this.rocket(k, this.rnd() < k.skill);
    }
  }

  private rocket(k: Kart, big: boolean) {
    k.st.rocket++;
    this.fire(k, big ? 1.3 : 0.6, big ? 1.5 : 1.35, 4);
    k.speed = big ? 18 : 12;
    if (k.p.human) {
      this.shout(big ? T("ROCKET START!", "火箭起步！") : T("GOOD START!", "好的起步！"), "#ffd23f");
      this.cam.shake(0.3);
    }
  }

  private leader() {
    return this.karts[this.order[0]];
  }

  /** The order now (in place, no allocation): finished first (by time), then by progress. */
  private rank() {
    const o = this.order,
      ks = this.karts;
    const better = (a: Kart, b: Kart) => (a.done >= 0 || b.done >= 0 ? (a.done < 0 ? Infinity : a.done) < (b.done < 0 ? Infinity : b.done) : a.prog > b.prog);
    for (let i = 1; i < o.length; i++) {
      const v = o[i];
      let j = i - 1;
      while (j >= 0 && better(ks[v], ks[o[j]])) ((o[j + 1] = o[j]), j--);
      o[j + 1] = v;
    }
  }

  private checkEnd(dt: number) {
    if (this.over) return;
    const h = this.human;
    if (h && h.done >= 0) return void (this.over = [...this.order]);
    if (!h && this.karts.every((k) => k.done >= 0)) return void (this.over = [...this.order]);
    if (h && this.karts.every((k) => k.p.human || k.done >= 0) && this.hurry < 0) {
      this.hurry = 9;
      this.shout(T("HURRY!", "快点！"), "#ff5f5f", H * 0.32);
    }
    if (this.hurry >= 0) {
      this.hurry -= dt;
      if (this.hurry <= 0) ((this.over = [...this.order]), (this.hurry = -1));
    }
    if (this.t > CAP) this.over = [...this.order];
  }

  private shout(s: string, c = "#ffd23f", y = H * 0.62) {
    this.say.s = s;
    this.say.c = c;
    this.say.t = 0;
    this.say.y = y;
  }

  /** Where a kart is: its sample, offset, progress, the ground under it (on the road or the shortcut). */
  private locate(k: Kart): void {
    const tr = this.trk,
      P = tr.short;
    if (k.on && P) {
      const rx = k.x - P.ax,
        rz = k.z - P.az;
      const u = rx * P.dx + rz * P.dz;
      const off = -rx * P.dz + rz * P.dx;
      if (u < P.u1 + 5 || u > P.u2 - 5) {
        // (near either end the shortcut runs into the road: back on it once inside its barriers)
        const j = tr.near(k.x, k.z, u < P.len / 2 ? P.iA : P.iB);
        const lat = (k.x - tr.px[j]) * -tr.tz[j] + (k.z - tr.pz[j]) * tr.tx[j];
        if (Math.abs(lat) < tr.edge[j] - 1.6 || u < 0 || u > P.len) {
          k.on = 0;
          k.seg = j;
          return this.locate(k);
        }
      }
      k.u = u;
      k.lat = off;
      const f = clamp(u / P.len, 0, 1);
      k.seg = tr.wrap(P.iA + f * P.di);
      k.s = (P.sA + f * P.ds) % tr.L;
      k.ftx = P.dx;
      k.ftz = P.dz;
      k.patch = tr.patches.length ? tr.patchAt(1, u, off) : null;
      k.gnd = (P.kind === "water" && Math.abs(off) > tr.shortHalf(u) + 0.1) || k.patch?.kind === "hole" ? WATER : 0;
      return;
    }
    const i = (k.seg = tr.near(k.x, k.z, k.seg, k.y));
    const ox = k.x - tr.px[i],
      oz = k.z - tr.pz[i];
    k.lat = ox * -tr.tz[i] + oz * tr.tx[i];
    const a = ox * tr.tx[i] + oz * tr.tz[i];
    k.s = (tr.s[i] + a + tr.L) % tr.L;
    k.ftx = tr.tx[i];
    k.ftz = tr.tz[i];
    k.patch = tr.patches.length ? tr.patchAt(0, k.s, k.lat) : null;
    k.gnd = tr.gap[i] ? WATER : tr.ground(i, a);
  }

  /** One kart, one small step. */
  private drive(k: Kart, h: number, c: Ctrl) {
    const tr = this.trk;
    const P = tr.short;
    if (k.respawn > 0) {
      k.respawn -= h;
      if (k.respawn <= 0) this.putBack(k);
      return;
    }
    this.locate(k);
    const i = k.seg;
    let ds = k.s - k.lastS;
    if (ds < -tr.L / 2) ds += tr.L;
    if (ds > tr.L / 2) ds -= tr.L;
    k.prog += ds;
    k.lastS = k.s;
    // the laps
    const lapNow = Math.floor(k.prog / tr.L);
    if (lapNow > k.lapIdx) {
      if (lapNow >= 1 && k.laps.length < lapNow) (k.laps.push(this.t - k.lapStart), (k.lapStart = this.t));
      k.lapIdx = lapNow;
      if (k.p.human && lapNow === tr.laps - 1 && !this.finalLap && k.done < 0) {
        this.finalLap = true;
        this.finalT = 0;
        sfx.star();
        music.rate(1.12);
      }
    }
    if (k.done < 0 && k.prog >= tr.laps * tr.L) this.finish(k);
    // up and down: the road under it, the air off the kicker, a crest
    if (k.air) {
      k.airT += h;
      k.vy -= G * h;
      k.y += k.vy * h;
      if (k.gnd === WATER) {
        if (k.y < -0.35) return this.splash(k);
      } else if (k.y <= k.gnd) {
        this.land(k);
        if (k.respawn > 0) return;
      }
    } else {
      const pred = k.y + k.vyG * h - 0.5 * G * h * h;
      if (k.gnd < pred - 0.04 && (k.speed > 4 || k.gnd === WATER)) {
        // (the road fell away faster than it can fall: off the lip, over a crest, off the shortcut, through the ice)
        k.air = true;
        k.airT = 0;
        k.vy = k.vyG;
        k.trickPlan = k.auto && this.rnd() < k.skill * 0.95;
      } else {
        // (the road's own climb; a jump in it (a respawn, a teleport) is no launch)
        k.vyG = clamp((k.gnd - k.y) / h, -20, 20);
        k.y = k.gnd;
      }
    }
    // which way it goes
    const fx = Math.sin(k.yaw),
      fz = Math.cos(k.yaw);
    const along = fx * k.ftx + fz * k.ftz;
    k.wrongT = along < -0.2 && k.speed > 4 ? k.wrongT + h : 0;
    // the speed it wants: off the road it bogs down (grass, snow), on the town's pavements a little
    const d = k.lat;
    const half = tr.half;
    let off = !k.on && !k.air && Math.abs(d) > half + 0.9;
    if (off && P && tr.zone[i] === Z_SHORT) {
      // (the shortcut's deck runs on across the verge to the road: no grass under it)
      const pu = (k.x - P.ax) * P.dx + (k.z - P.az) * P.dz;
      if (pu > P.ua - 2 && pu < P.ub + 2 && Math.abs((k.x - P.ax) * -P.dz + (k.z - P.az) * P.dx) < tr.shortHalf(pu)) off = false;
    }
    k.offT = off ? k.offT + h : 0;
    // the ground: ice slides, a puddle drags, a wet road grips a little less
    const pk = k.air ? null : k.patch;
    const ice = !k.air && (pk?.kind === "ice" || (k.on === 1 && !!P?.ice));
    const puddle = pk?.kind === "puddle";
    k.ice = ice ? k.ice + h : 0;
    k.grip = ice ? 0.2 : (tr.spec.grip ?? 1);
    let vmax = VMAX * k.pace * this.rubber(k) * (1 + 0.006 * k.coins);
    if (off && k.quantum <= 0) vmax *= k.boost > 0 ? 0.88 : tr.zone[i] === Z_CITY ? 0.72 : this.offK;
    if (puddle && k.quantum <= 0) {
      vmax *= 0.7;
      k.speed *= Math.exp(-1.1 * h);
      if (k.puddleT <= 0) {
        k.puddleT = 0.5;
        if (k.p.human) (sfx.whoosh(), this.cam.shake(0.12), (this.drops = 1));
        if (k.speed > 12) this.fx.burst(v1.set(k.x, k.y + 0.3, k.z), 26, this.splashC, { speed: 6, up: 5, size: 0.18, life: 0.7 });
      }
    }
    k.puddleT -= h;
    const onKerb = !k.on && !k.air && Math.abs(d) > half - 0.1 && Math.abs(d) < half + 1.3;
    if (onKerb) vmax *= 0.985;
    // (past the line, the visitor's race is over: a slow lap of honour; a rival who is done keeps out of the way at speed)
    if (k.done >= 0 && k.p.human) vmax *= 0.4;
    if (k.boost > 0) {
      vmax *= k.boostP;
      k.boost -= h;
      if (k.boost <= 0) ((k.boostP = 1), (k.boostC = 0));
    }
    if (k.quantum > 0) {
      vmax *= 1.18;
      k.quantum -= h;
    }
    // (on ice the wheels spin: slower to pick up speed, slower to stop)
    const traction = ice ? 0.5 : 1;
    if (k.stall > 0) {
      k.stall -= h;
      k.speed *= Math.exp(-4 * h);
    } else if (k.spin > 0) {
      k.spin -= h;
      k.speed *= Math.exp(-2.6 * h * traction);
      k.spinA += h * 14 * Math.max(0.3, k.spin);
    } else if (k.air) {
      // (in the air it keeps its speed)
    } else if (c.brake) k.speed = Math.max(-7, k.speed - 34 * h * traction);
    else if (c.lift && k.speed > 14) k.speed *= Math.exp(-0.9 * h * traction);
    else if (k.speed < vmax) k.speed += ((vmax - k.speed) * (k.boost > 0 ? 5 : 1.25) * h + (k.speed < 8 ? 9 * h : 0)) * (k.boost > 0 ? 1 : traction);
    else k.speed += (vmax - k.speed) * 2.2 * h;
    // A: a hop and a drift on the ground, a trick in the air
    const press = c.drift && !k.aDown;
    k.aDown = c.drift;
    if (k.air) {
      if (press && !k.trick && k.flip <= 0 && k.airT < 0.5 && k.vy > -8) {
        k.trick = true;
        k.trickT = 0;
        k.a.cheer(0.8);
        if (k.p.human) (sfx.blip(5), beep(880, 0.12, "square", 0.25, 1.6));
      }
      if (k.trick) k.trickT += h;
    } else if (press && k.hop <= 0 && k.spin <= 0 && k.speed > 8) {
      k.hop = 0.24;
      if (k.p.human) sfx.blip(2);
    }
    if (k.hop > 0) k.hop -= h;
    if (!k.drift && !k.air && c.drift && k.hop > 0 && Math.abs(c.steer) > 0.3 && k.speed > 11 && k.spin <= 0) {
      k.drift = Math.sign(c.steer);
      k.charge = 0;
      k.tier = 0;
    }
    if (k.drift && (!c.drift || k.spin > 0 || k.speed < 8)) {
      if (k.spin <= 0 && !c.drift && k.tier > 0) this.fire(k, MT_T[k.tier], MT_P[k.tier], k.tier);
      k.drift = 0;
      k.charge = 0;
      k.tier = 0;
    }
    k.steer += (c.steer - k.steer) * Math.min(1, 12 * h);
    const sp = Math.abs(k.speed);
    const grip = clamp(sp / 9, 0, 1) * (k.air ? 0.3 : 1);
    let rate: number;
    if (k.drift) {
      const kk = clamp(k.steer * k.drift, -1, 1);
      // (steering out of it almost straightens it: a drift never forces you into the grass)
      rate = k.drift * (1.2 + 0.95 * kk) * grip;
      if (!k.air) {
        k.charge += h * (1.0 + 0.6 * Math.max(0, kk)) * (off ? 0.3 : 1);
        const nt = k.charge >= TIER_AT[3] ? 3 : k.charge >= TIER_AT[2] ? 2 : k.charge >= TIER_AT[1] ? 1 : 0;
        if (nt > k.tier) {
          k.tier = nt;
          if (k.p.human) beep([0, 660, 880, 1175][nt], 0.09, "square", 0.22);
        }
      }
    } else rate = k.steer * 2.0 * grip * Math.sign(k.speed || 1) * (1 - 0.25 * clamp((sp - 20) / 16, 0, 1));
    if (k.spin > 0) rate = 0;
    k.yaw -= rate * h;
    k.slide += ((k.drift ? k.drift * 0.62 : k.steer * 0.06) - k.slide) * Math.min(1, 8 * h);
    // the move: the path follows the nose as fast as the ground grips (on ice, hardly: it slides on)
    const tvx = Math.sin(k.yaw) * k.speed,
      tvz = Math.cos(k.yaw) * k.speed;
    if (k.air || k.grip >= 0.99) {
      k.vx = tvx;
      k.vz = tvz;
    } else {
      const a = 1 - Math.exp(-(1.1 + 30 * k.grip * k.grip * k.grip) * h);
      k.vx += (tvx - k.vx) * a;
      k.vz += (tvz - k.vz) * a;
    }
    k.x += k.vx * h;
    k.z += k.vz * h;
    // the gusts push across the road (more in the air)
    if (this.gust.k > 0 && tr.windy[i] && k.respawn <= 0) {
      const push = this.gust.k * tr.spec.wind!.force * this.gust.side * (k.air ? 1.4 : 1) * h;
      k.x += -tr.tz[i] * push;
      k.z += tr.tx[i] * push;
    }
    // the barriers, the shortcut's edges
    k.wallT -= h;
    if (k.on && P) {
      if (!k.air && k.gnd === WATER) {
        // (off the side of the plank, the ice lane, into a hole: it drops into the water)
        k.air = true;
        k.airT = 0;
        k.vy = 0;
      } else if (P.kind === "wall") {
        const rx = -P.dz,
          rz = P.dx;
        const off2 = (k.x - P.ax) * rx + (k.z - P.az) * rz;
        const lim = tr.shortHalf(k.u) - 0.95;
        if (Math.abs(off2) > lim) this.hitWall(k, Math.sign(off2), rx, rz, Math.abs(off2) - lim, P.dx, P.dz, h);
      }
    } else if (!(tr.gap[i] && k.air)) {
      const ox = k.x - tr.px[i],
        oz = k.z - tr.pz[i];
      const rx = -tr.tz[i],
        rz = tr.tx[i];
      const d2 = ox * rx + oz * rz;
      const lim = tr.edge[i] - 0.95;
      if (Math.abs(d2) > lim) {
        let onto = false;
        if (P && d2 * P.side > 0 && tr.openS[i]) {
          const pu = (k.x - P.ax) * P.dx + (k.z - P.az) * P.dz;
          const po = (k.x - P.ax) * -P.dz + (k.z - P.az) * P.dx;
          onto = pu > 0 && pu < P.len && Math.abs(po) < tr.shortHalf(pu) - 0.15;
        }
        if (onto) {
          // through the gap in the barrier: onto the shortcut
          k.on = 1;
          k.st.plank++;
          if (k.p.human) (this.shout(T("SHORTCUT!", "捷径！"), "#ffd23f"), sfx.coin());
        } else this.hitWall(k, Math.sign(d2), rx, rz, Math.abs(d2) - lim, tr.tx[i], tr.tz[i], h);
      }
    }
    // the kerbs rumble under you
    if (onKerb && k.p.human && sp > 12) {
      k.kerbT -= h;
      if (k.kerbT <= 0) ((k.kerbT = 0.07), this.cam.shake(0.05), sfx.tick());
    }
    if (!k.air) this.pickups(k);
    if (k.roll > 0) {
      k.roll -= h;
      if (k.roll <= 0) {
        k.item = k.rollItem;
        k.itemN = k.item === "turbo3" ? 3 : 1;
        k.useT = 0.6 + this.rnd() * 2.2 * (1.2 - k.skill);
        if (k.p.human) ((this.itemPop = 1), sfx.star());
      }
    }
    if (c.use && k.item && k.roll <= 0) this.useItem(k);
    // the slipstream: tucked in behind a kart, fast enough
    if (!k.air && k.speed > 18 && k.boost <= 0) {
      let behind = false;
      for (const o of this.karts) {
        if (o === k || o.respawn > 0 || Math.abs(o.y - k.y) > 2) continue;
        const dx = o.x - k.x,
          dz = o.z - k.z;
        const ahead = dx * fx + dz * fz;
        const side = Math.abs(dx * fz - dz * fx);
        if (ahead > 2.5 && ahead < 16 && side < 2) behind = true;
      }
      k.draft = behind ? k.draft + h : Math.max(0, k.draft - h * 2);
      if (k.draft > 1.2) {
        k.draft = 0;
        this.fire(k, 1.0, 1.32, 0);
        if (k.p.human) this.shout(T("SLIPSTREAM!", "尾流！"), "#bfefff");
      }
    } else k.draft = Math.max(0, k.draft - h * 2);
    // SHIELDED rams
    if (k.quantum > 0) for (const o of this.karts) if (o !== k && o.quantum <= 0 && Math.abs(o.y - k.y) < 2 && Math.hypot(o.x - k.x, o.z - k.z) < 2.5) this.spinOut(o);
  }

  /** Into a wall on side `sg` (its outward normal rx, rz; `ex` metres through it; the road runs tx, tz): pushed back, slowed, turned along. */
  private hitWall(k: Kart, sg: number, rx: number, rz: number, ex: number, tx: number, tz: number, h: number) {
    k.x -= sg * rx * ex;
    k.z -= sg * rz * ex;
    const vn = k.vx * rx + k.vz * rz;
    if (vn * sg > 0) ((k.vx -= rx * vn), (k.vz -= rz * vn));
    // (how much of its way goes into the wall: none when it is already heading off it, pushed there by a
    // gust, a rival or the ice: then the wall only holds it, no hit, no turn back toward it)
    const back = k.speed < 0 ? -1 : 1;
    const into = (Math.sin(k.yaw) * rx + Math.cos(k.yaw) * rz) * sg * back;
    if (into <= 0) return;
    // the hit costs speed by its angle; grinding along it (the wheel still over) costs a little all the while
    k.speed *= Math.exp(-(Math.min(0.55, Math.max(0, into - 0.05) * 0.9) * 30 + 1) * h);
    // the nose swings along the wall and a hair off it: fast on a square hit, never slower than the
    // wheel can turn it back in, so it always comes off the wall (it used to stay glued, nose a few degrees in)
    const along2 = Math.sign(Math.sin(k.yaw) * tx + Math.cos(k.yaw) * tz) || 1;
    const wy = Math.atan2(tx * along2, tz * along2) + 0.02 * sg * along2 * back;
    const a = turn(k.yaw, wy);
    k.yaw += Math.sign(a) * Math.min(Math.abs(a), Math.max(Math.abs(a) * Math.min(1, into * 60 * h) * 0.5, 3 * h));
    if (into > 0.2 && k.wallT <= 0) {
      k.wallT = 0.4;
      k.st.walls++;
      if (k.st.where.length < 40) k.st.where.push(Math.round(k.s));
      this.fx.burst(v1.set(k.x + sg * rx, k.y + 0.6, k.z + sg * rz), 14, C_SPARK, { speed: 6, up: 3, size: 0.12, life: 0.5 });
      if (k.p.human) (sfx.thud(), this.cam.shake(0.3));
    } else if (k.p.human && k.speed > 15 && Math.random() < h * 20) this.fx.burst(v1.set(k.x + sg * rx * 0.9, k.y + 0.5, k.z + sg * rz * 0.9), 2, C_SPARK, fxo(4, 2, 18, 0.09, 0.35));
  }

  /** Z-Blocks, pads, rugs, coins under the kart. */
  private pickups(k: Kart) {
    const tr = this.trk;
    for (let n = 0; n < this.boxes.length; n++) {
      const b = this.boxes[n];
      if (b.off > 0) continue;
      if (Math.abs(b.x - k.x) < 1.7 && Math.abs(b.z - k.z) < 1.7 && Math.abs(b.y - 1.25 - k.y) < 2) {
        b.off = 3;
        this.fx.burst(v1.set(b.x, b.y, b.z), 24, C_GOLD, { speed: 6, up: 4, size: 0.2, life: 0.7 });
        if (!k.item && k.roll <= 0) {
          k.roll = ROLL_T;
          k.rollItem = this.deal(k);
          if (k.p.human) ((this.lastRollTick = -1), sfx.coin());
        }
      }
    }
    for (const p of this.pads) {
      let hit: boolean;
      if (p.on) hit = k.on === 1 && Math.abs(k.u - p.u) < 3.6 && Math.abs(k.lat) < 2.2;
      else {
        // (how far past the pad it is, either way round the loop)
        let ds = tr.fwd(p.s, k.s);
        if (ds > tr.L / 2) ds -= tr.L;
        hit = !k.on && Math.abs(ds) < 3.6 && Math.abs(k.lat - p.d) < 2.2 && Math.abs(k.y - p.y) < 1.2;
      }
      if (hit) {
        if (k.boost < 0.6 || k.boostC !== 5) {
          k.st.pads++;
          this.fx.burst(v1.set(k.x, k.y + 0.3, k.z), 14, C_PAD, { speed: 5, up: 3, size: 0.16, life: 0.5 });
        }
        this.fire(k, 1.05, 1.48, 5, k.boost > 0.6 && k.boostC === 5);
      }
    }
    for (const r of this.rugs) {
      if (r.life <= 0 || (r.by === k.seat && r.life > 19.4)) continue;
      if (Math.abs(r.y - k.y) < 1.5 && Math.hypot(r.x - k.x, r.z - k.z) < 1.7) {
        r.life = 0;
        this.spinOut(k);
      }
    }
    for (const c of this.coins) {
      if (c.off > 0) continue;
      if (Math.abs(c.x - k.x) < 1.4 && Math.abs(c.z - k.z) < 1.4 && Math.abs(c.y - 0.9 - k.y) < 2) {
        c.off = 8;
        this.fx.burst(v1.set(c.x, c.y, c.z), 10, C_COIN, { speed: 3, up: 4, size: 0.14, life: 0.5 });
        if (k.coins < MAX_COINS) k.coins++;
        if (k.p.human) (sfx.coin(), (this.coinPop = 1));
      }
    }
  }

  private land(k: Kart) {
    const hard = -k.vy;
    k.y = k.gnd;
    k.vy = 0;
    k.vyG = 0;
    k.air = false;
    k.bounceV -= Math.min(7, hard * 0.45);
    if (k.flip > 0) {
      k.flip = 0;
      k.spin = Math.max(k.spin, 0.5);
    }
    if (k.trick) {
      k.trick = false;
      k.st.tricks++;
      this.fire(k, 0.9, 1.42, 4);
      if (k.p.human) this.shout(T("TRICK!", "特技！"), "#7ff3ff");
    }
    if (hard > 4) {
      this.fx.burst(v1.set(k.x, k.y + 0.2, k.z), 18, this.course.dust ?? C_DUST, { speed: 5, up: 1.5, size: 0.24, life: 0.6, gravity: -1 });
      if (k.p.human) (sfx.thud(), this.cam.shake(Math.min(0.6, 0.15 + hard * 0.04)));
    }
  }

  /** Into the canal or the lake: a splash, and back on the road a moment later. */
  private splash(k: Kart) {
    const tr = this.trk;
    k.st.splash++;
    if (k.st.where.length < 40) k.st.where.push(-Math.round(k.s));
    k.respawn = 1.3;
    // (off the shortcut: back on the road where it was; out of the canal: past it)
    k.respawnAt = k.on || tr.land < 0 || !tr.gap[tr.wrap(k.seg)] ? k.seg : tr.wrap(tr.land + 6 / STEP);
    k.a.root.visible = false;
    k.drift = 0;
    k.charge = 0;
    k.tier = 0;
    k.trick = false;
    k.air = false;
    k.boost = 0;
    k.boostP = 1;
    k.coins = Math.max(0, k.coins - 2);
    this.fx.burst(v1.set(k.x, WATER + 0.3, k.z), 60, this.splashC, { speed: 6, up: 10, size: 0.26, life: 1.1 });
    if (k.p.human) (sfx.thud(), sfx.whoosh(), this.cam.shake(0.45), this.shout(T("SPLASH!", "落水！"), "#7fd6ff"));
    else if (this.human && Math.hypot(k.x - this.human.x, k.z - this.human.z) < 50) sfx.thud();
  }

  private putBack(k: Kart) {
    const tr = this.trk;
    const i = k.respawnAt;
    const p = tr.at(i, clamp(tr.line[i], -3, 3));
    k.x = p.x;
    k.z = p.z;
    k.y = p.y + 2.2;
    k.vy = 0;
    k.air = true;
    k.airT = 1;
    k.on = 0;
    k.seg = i;
    k.yaw = tr.ty[i];
    k.speed = 10;
    k.vx = Math.sin(k.yaw) * 10;
    k.vz = Math.cos(k.yaw) * 10;
    k.a.root.visible = true;
    // (its progress: from the old reading to here)
    const s = tr.s[i];
    let ds = s - k.lastS;
    if (ds < -tr.L / 2) ds += tr.L;
    if (ds > tr.L / 2) ds -= tr.L;
    k.prog += ds;
    k.lastS = s;
    k.s = s;
  }

  private finish(k: Kart) {
    k.done = this.t;
    if (k.laps.length < this.trk.laps) k.laps.push(this.t - k.lapStart);
    if (k.p.human) {
      k.auto = true;
      k.a.cheer(3);
      sfx.fanfare();
      this.hurry = -1;
      this.say.t = 1;
      this.fireworks = 0;
    } else k.a.cheer(2);
  }

  /** A gentle rubber band: the pack stays a pack (never on the visitor). */
  private rubber(k: Kart) {
    if (k.p.human || !this.human || this.human.done >= 0) return 1;
    const gap = k.prog - this.human.prog;
    return gap > 0 ? 1 - clamp((gap - 10) / 150, 0, 1) * 0.06 : 1 + clamp((-gap - 10) / 150, 0, 1) * 0.07;
  }

  /** A boost: `t` seconds at `p` × top speed. tier: 0 wind, 1–3 mini-turbos, 4 a rocket/trick/turbo, 5 a pad. */
  private fire(k: Kart, t: number, p: number, tier: number, quiet = false) {
    const fresh = k.boost <= 0.15 || p > k.boostP + 0.01;
    k.boostP = k.boost > 0 ? Math.max(k.boostP, p) : p;
    k.boost = Math.max(k.boost, t);
    k.boostC = tier;
    if (tier >= 1 && tier <= 3) k.st.mt[tier]++;
    if (quiet || !fresh) return;
    k.speed = Math.max(k.speed, VMAX * k.pace * Math.min(p, 1.3)) + 2.5;
    k.kick = 1;
    const cols = tier >= 1 && tier <= 3 ? C_TIER[tier] : C_FIRE;
    this.fx.burst(v1.set(k.x - Math.sin(k.yaw) * 1.7, k.y + 0.7, k.z - Math.cos(k.yaw) * 1.7), 22, cols, { speed: 5, up: 2, size: 0.18, life: 0.5, dir: v2.set(-Math.sin(k.yaw) * 6, 0, -Math.cos(k.yaw) * 6) });
    if (k.p.human) {
      sfx.whoosh();
      beep(140, 0.35, "sawtooth", 0.18, 2.4);
      this.cam.shake(0.12 + 0.05 * Math.min(3, tier || 2));
      this.fovKick = 1;
    }
  }

  private loseCoins(k: Kart, n: number) {
    const lost = Math.min(k.coins, n);
    k.coins -= lost;
    if (lost) this.fx.burst(v1.set(k.x, k.y + 1.2, k.z), lost * 5, C_COIN, { speed: 5, up: 6, size: 0.2, life: 0.8 });
  }

  private spinOut(k: Kart) {
    if (k.spin > 0 || k.quantum > 0 || k.respawn > 0) return;
    k.spin = 1.15;
    k.spinA = 0;
    k.drift = 0;
    k.charge = 0;
    k.tier = 0;
    k.boost = 0;
    k.boostP = 1;
    k.angryT = 2;
    k.a.hit();
    this.loseCoins(k, 3);
    this.fx.burst(v1.set(k.x, k.y + 1, k.z), 26, ["#ffd23f", "#ffffff", k.p.color], { speed: 7, up: 5, size: 0.2, life: 0.8 });
    if (k.p.human) (sfx.hit(), this.cam.shake(0.5));
    else if (this.human && Math.hypot(k.x - this.human.x, k.z - this.human.z) < 40) sfx.hit();
  }

  /** A big hit: the kart is thrown up and over. */
  private tumble(k: Kart) {
    if (k.quantum > 0 || k.respawn > 0) return;
    this.spinOut(k);
    k.spin = Math.max(k.spin, 1.4);
    k.speed *= 0.35;
    k.air = true;
    k.airT = 0;
    k.vy = 8;
    k.flip = 1;
    k.trick = false;
  }

  /** What the Z-Block gives: the further back, the better. */
  private deal(k: Kart): Item {
    const place = this.order.indexOf(k.seat);
    const row = DEAL[place] ?? DEAL[3];
    let r = this.rnd() * row.reduce((a, b) => a + b, 0);
    for (let n = 0; n < row.length; n++) if ((r -= row[n]) < 0) return ITEMS[n];
    return "turbo";
  }

  private useItem(k: Kart) {
    const it = k.item;
    if (!it) return;
    k.st.items++;
    if (--k.itemN <= 0) k.item = null;
    if (it === "turbo" || it === "turbo3") {
      this.fire(k, 1.4, 1.55, 4);
      k.speed = Math.max(k.speed, VMAX * 1.12);
    } else if (it === "rug") {
      const g = new THREE.Group();
      const b1 = new THREE.Mesh(GEO.box, toonM("#c2185b"));
      b1.scale.set(1.8, 0.08, 1.4);
      b1.position.y = 0.06;
      const b2 = new THREE.Mesh(GEO.box, toonM("#ffd23f"));
      b2.scale.set(1.2, 0.1, 0.8);
      b2.position.y = 0.08;
      g.add(b1, b2);
      const x = k.x - Math.sin(k.yaw) * 2.4,
        z = k.z - Math.cos(k.yaw) * 2.4;
      g.position.set(x, k.y + 0.04, z);
      g.rotation.y = k.yaw;
      this.w.scene.add(g);
      this.rugs.push({ m: g, x, y: k.y, z, life: 20, by: k.seat });
      if (k.p.human) sfx.thud();
    } else if (it === "zap" || it === "attack") {
      const st = this.order;
      const place = st.indexOf(k.seat);
      const big = it === "attack";
      // (the zap: the kart just ahead; the 51%: the leader, whoever it is)
      const to = big ? (st[0] !== k.seat ? st[0] : -1) : place > 0 ? st[place - 1] : -1;
      const m = new THREE.Mesh(GEO.ball, glowM(big ? "#ff3b5c" : "#7ff3ff"));
      m.scale.setScalar(big ? 1.8 : 0.9);
      const core = new THREE.Mesh(GEO.ball, glowM("#ffffff", false));
      core.scale.setScalar(0.5);
      m.add(core);
      if (big) {
        const ring = new THREE.Mesh(GEO.ring, glowM("#ffd23f"));
        ring.scale.setScalar(1.5);
        m.add(ring);
        if (to >= 0 && this.karts[to].p.human) ((this.warn = 4), sfx.lose());
        if (k.p.human) this.shout(T("51% ATTACK!", "51% 攻击！"), "#ff3b5c");
      }
      this.w.scene.add(m);
      this.shots.push({ m, i: k.seg + 4 / STEP, d: k.lat, to, life: big ? 12 : 6, big, by: k.seat, x: k.x, y: k.y + 1, z: k.z });
      if (k.p.human) sfx.go();
    } else if (it === "quantum") {
      k.quantum = 6;
      this.fire(k, 0.6, 1.3, 4);
      if (k.p.human) (sfx.star(), this.shout(T("SHIELDED!", "屏蔽模式！"), "#8effc0"));
    }
  }

  private moveShots(h: number) {
    const tr = this.trk;
    for (const z of this.shots) {
      if (z.life <= 0) continue;
      z.life -= h;
      const tk = z.to >= 0 ? this.karts[z.to] : null;
      // (down the road; once close, straight for its target, wherever it is)
      const close = tk && Math.hypot(tk.x - z.x, tk.z - z.z) < 22;
      if (close && tk) {
        const sp = (z.big ? 70 : 58) * h;
        const dx = tk.x - z.x,
          dy = tk.y + 1 - z.y,
          dz = tk.z - z.z;
        const l = Math.hypot(dx, dy, dz) || 1;
        z.x += (dx / l) * Math.min(l, sp);
        z.y += (dy / l) * Math.min(l, sp);
        z.z += (dz / l) * Math.min(l, sp);
        z.i = tk.seg;
      } else {
        z.i += ((z.big ? 75 : 62) * h) / STEP;
        if (tk) z.d += (clamp(tk.on ? 0 : tk.lat, -tr.half, tr.half) - z.d) * Math.min(1, 4 * h);
        tr.at(z.i, z.d, (z.big ? 3 : 1.1) + Math.sin(this.wall * 20) * 0.1, v1);
        z.x = v1.x;
        z.y = v1.y;
        z.z = v1.z;
      }
      z.m.position.set(z.x, z.y, z.z);
      z.m.rotation.y += h * 8;
      if (Math.random() < h * 60) this.fx.burst(z.m.position, z.big ? 3 : 1, z.big ? C_BLAST : C_ZAP, fxo(0.6, 0.5, 0, z.big ? 0.3 : 0.18, 0.4));
      if (tk && tk.done < 0 && tk.respawn <= 0 && Math.hypot(z.x - tk.x, z.z - tk.z) < (z.big ? 3 : 2) && Math.abs(z.y - tk.y) < 3) {
        z.life = 0;
        if (z.big) {
          // the blast takes the leader and whoever is close
          for (const o of this.karts) if (o.seat !== z.by && Math.hypot(o.x - tk.x, o.z - tk.z) < 7) this.tumble(o);
          this.fx.burst(z.m.position, 90, C_BLAST, { speed: 14, up: 8, size: 0.32, life: 1.1 });
          if (this.human && Math.hypot(this.human.x - tk.x, this.human.z - tk.z) < 60) (sfx.thud(), sfx.hit(), this.cam.shake(0.8));
        } else {
          this.tumble(tk);
          this.fx.burst(z.m.position, 30, C_ZAP, { speed: 8, up: 4, size: 0.2, life: 0.6 });
        }
      }
      if (z.life <= 0) z.m.visible = false;
    }
  }

  /** When each pair of karts last knocked (race time), so a knock is felt once. */
  private bumpAt = new Float32Array(16).fill(-9);
  /** Karts knock into each other. */
  private bump(h: number) {
    const ks = this.karts;
    for (let i = 0; i < ks.length; i++)
      for (let j = i + 1; j < ks.length; j++) {
        const a = ks[i],
          b = ks[j];
        if (a.respawn > 0 || b.respawn > 0 || Math.abs(a.y - b.y) > 1.4) continue;
        const dx = b.x - a.x,
          dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d > 2.3 || d < 1e-4) continue;
        const push = (2.3 - d) / 2;
        const nx = dx / d,
          nz = dz / d;
        a.x -= nx * push;
        a.z -= nz * push;
        b.x += nx * push;
        b.z += nz * push;
        const aBehind = Math.sin(a.yaw) * nx + Math.cos(a.yaw) * nz > 0.3;
        const slow = aBehind ? a : b;
        // (a drag per second, not per step: the same at any frame rate)
        if (slow.boost <= 0) slow.speed *= Math.exp(-0.9 * h);
        // (a knock you feel: by how fast they came together, not by the frame's length; a rub side by side is silent)
        const rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
        if ((a.p.human || b.p.human) && rel > 2 && this.t - this.bumpAt[i * 4 + j] > 0.4) {
          this.bumpAt[i * 4 + j] = this.t;
          this.cam.shake(Math.min(0.3, 0.1 + rel * 0.02));
          sfx.thud();
          this.fx.burst(v1.set((a.x + b.x) / 2, a.y + 0.6, (a.z + b.z) / 2), 8, C_SPARK, { speed: 5, up: 3, size: 0.11, life: 0.4 });
        }
      }
  }

  /** Where to aim: `la` metres ahead, on the racing line (weight w, the rest `lane`), or onto the shortcut. */
  private aim(k: Kart, la: number, w: number, lane: number, plank: boolean, out: THREE.Vector3) {
    const tr = this.trk,
      P = tr.short;
    if (k.on && P) return tr.onShort(k.u + la, this.shortLane(k.u + la), out);
    if (plank && P) {
      // (from 70 m before the fork until just past the gap in the barrier: the shortcut's line)
      const toA = tr.fwd(k.s, P.sA);
      const past = tr.fwd(P.sA, k.s);
      if (toA < 70 || past < P.u1 + 8) {
        const uk = (k.x - P.ax) * P.dx + (k.z - P.az) * P.dz;
        if (uk > -la) {
          const u = Math.max(0, uk) + la;
          return tr.onShort(u, this.shortLane(u), out);
        }
        const j = tr.wrap(k.seg + la / STEP);
        return tr.at(j, P.side * (tr.half - 1.2) * clamp((70 - toA) / 30, 0, 1) + tr.line[j] * clamp((toA - 40) / 30, 0, 1), 0, out);
      }
    }
    const j = tr.wrap(k.seg + la / STEP);
    return tr.at(j, tr.line[j] * w + lane * (1 - w), 0, out);
  }

  /** Where to be across the shortcut `u` along it: its middle, or round a hole in the ice. */
  private shortLane(u: number) {
    for (const p of this.trk.patches) if (p.on && p.kind === "hole" && u > p.s - 9 && u < p.s + p.len + 5) return (p.d0 + p.d1) / 2 > 0 ? p.d0 - 1.9 : p.d1 + 1.9;
    return 0;
  }

  /** For the bench's scripted human: the point a good driver aims at (round the puddles it can see). */
  botTarget(k: Kart, la: number, w: number, plank: boolean): [number, number] {
    const j = this.trk.wrap(k.seg + la / STEP);
    const line = this.trk.line[j] * w;
    const lane = this.avoid(k, line, () => true);
    this.aim(k, la, lane === line ? w : 0, lane, plank, v3);
    return [v3.x, v3.z];
  }

  /** The lane round the puddles ahead (those `sees` notices); `slick` set when there is ice on the way. */
  private avoid(k: Kart, lane: number, sees: (n: number) => boolean) {
    const tr = this.trk;
    const HALF = tr.half;
    const sp = Math.abs(k.speed);
    this.slick = k.ice > 0;
    for (let n = 0; n < tr.patches.length; n++) {
      const p = tr.patches[n];
      if (p.on) continue;
      const ahead = tr.fwd(k.s, p.s);
      if (p.kind === "ice" && (ahead < 18 + sp * 0.9 || tr.fwd(p.s, k.s) < p.len) && lane > p.d0 - 2 && lane < p.d1 + 2) this.slick = true;
      if (p.kind === "puddle" && ahead > 2 && ahead < 22 + sp * 0.8 && sees(n)) {
        const at = k.on ? 0 : k.lat;
        // (to the middle of the wider side left free)
        if ((at > p.d0 - 1.6 && at < p.d1 + 1.6) || (lane > p.d0 - 1.6 && lane < p.d1 + 1.6)) lane = p.d0 + HALF > HALF - p.d1 ? (p.d0 - 1.8 - HALF + 1) / 2 : (p.d1 + 1.8 + HALF - 1) / 2;
      }
    }
    return clamp(lane, -HALF + 1, HALF - 1);
  }
  private slick = false;

  /** The AI's hands. */
  private ai(k: Kart, h: number): Ctrl {
    const tr = this.trk,
      P = tr.short;
    const HALF = tr.half;
    const c = this.ctrl;
    const sk = k.skill;
    const sp = Math.abs(k.speed);
    k.laneT -= h;
    const bend = tr.bend(k.seg, 30);
    if (k.laneT <= 0) {
      k.laneT = 1.2 + this.rnd() * 2.5;
      k.lane = (this.rnd() - 0.5) * 2 * (HALF - 2);
      k.aimPads = this.rnd() < 0.1 + 0.8 * sk * sk;
      // (the good ones go for the coins)
      if (this.rnd() < sk * 0.5 && k.coins < MAX_COINS) {
        for (const cn of this.coins) {
          if (cn.s < 0) continue;
          const ahead = tr.fwd(k.s, cn.s);
          if (cn.off <= 0 && ahead > 10 && ahead < 45) {
            k.lane = clamp(cn.d, -HALF + 1.2, HALF - 1.2);
            break;
          }
        }
      }
    }
    // the shortcut: decided once a lap, some way before the fork (only the bold and skilled)
    if (!k.on && P) {
      const toA = tr.fwd(k.s, P.sA);
      if (toA < 120 && toA > 80 && k.planLap !== k.lapIdx) {
        k.planLap = k.lapIdx;
        k.plan = sk >= 0.7 && k.spin <= 0 && this.rnd() < (sk - 0.62) * 2.2;
      }
      if (toA > 200 && toA < tr.L - 30) k.plan = false;
    }
    const w = 0.4 + 0.58 * sk;
    let lane = k.lane;
    // a pad ahead: aim for it
    if (k.aimPads && !k.on) {
      for (const p of this.pads) {
        if (p.on) continue;
        const ahead = tr.fwd(k.s, p.s);
        if (ahead > 3 && ahead < 42) {
          lane = p.d;
          break;
        }
      }
    }
    // a rug ahead on its lane: round it
    for (const r of this.rugs) {
      if (r.life <= 0) continue;
      const dx = r.x - k.x,
        dz = r.z - k.z;
      const ahead = dx * Math.sin(k.yaw) + dz * Math.cos(k.yaw);
      if (ahead > 2 && ahead < 26 && Math.abs(r.y - k.y) < 2) {
        const side = dx * -Math.cos(k.yaw) + dz * Math.sin(k.yaw);
        if (Math.abs(side) < 2.4 && this.rnd() < sk * 0.25) k.lane = clamp(k.lane + (side > 0 ? -3.5 : 3.5), -HALF + 1, HALF - 1);
      }
    }
    // puddles ahead: round them (the careful ones see them); ice ahead: easy on the throttle
    lane = this.avoid(k, lane, (n) => ((k.seat * 7 + n * 13 + k.lapIdx * 5) % 10) / 10 < sk * 1.05 - 0.05);
    const slick = this.slick;
    const la = 6 + sp * 0.38;
    // (the pad's lane overrides the line: aim at it fully)
    const tgt = this.aim(k, la, lane === k.lane ? w : 0, lane, k.plan, v2);
    const want = yawOf(tgt.x - k.x, tgt.z - k.z);
    const diff = turn(k.yaw, want);
    // (the turn it wants, as a rate; the hands that give it, in a drift or not)
    const grip = clamp(sp / 9, 0, 1) * (k.air ? 0.3 : 1) || 0.01;
    const rateWant = -diff * 4.2;
    let steer: number;
    if (k.drift && !k.air) {
      const kk = (rateWant / (k.drift * grip) - 1.2) / 0.95;
      steer = clamp(kk, -1, 1) * k.drift;
      k.counterT = kk < -0.95 ? k.counterT + h : 0;
    } else steer = clamp(rateWant / (2.0 * grip * (1 - 0.25 * clamp((sp - 20) / 16, 0, 1))), -1, 1);
    steer += Math.sin(this.wall * (1.3 + k.seat) + k.seat * 7) * 0.3 * (1 - sk) * (k.on ? 0.5 : 1);
    steer = clamp(steer, -1, 1);
    // the bends: drift the long ones (the good ones nearly always), lift or brake where it is too tight
    const inBend = Math.abs(bend) > 0.5;
    if (inBend && !k.bendSeen) ((k.bendSeen = true), (k.willDrift = this.rnd() < 0.05 + 0.9 * sk ** 1.5));
    if (!inBend && Math.abs(bend) < 0.22) k.bendSeen = false;
    let kap = 0;
    if (!k.on) for (let m = 8 + sp * 0.25; m < 30 + sp * 0.4; m += 3) kap = Math.max(kap, Math.abs(tr.lk[tr.wrap(k.seg + m / STEP)]));
    const can = (k.drift || (k.willDrift && sp > 16) ? 2.1 : 2.0 * (1 - 0.25 * clamp((sp - 20) / 16, 0, 1))) * (slick ? 0.6 + 0.15 * (1 - sk) : 1) * (tr.spec.grip ?? 1);
    const need = sp * kap;
    c.lift = need > can * (1.05 - 0.1 * (1 - sk));
    c.brake = need > can * 1.3 && sp > 20;
    let drift = false;
    if (k.air) drift = k.trickPlan && k.flip <= 0 && k.airT > 0.05 && k.airT < 0.35;
    else if (k.drift) {
      const tierWant = sk < 0.55 ? 1 : sk < 0.8 ? 2 : 3;
      // (held while the bend lasts, let go once it opens out with the colour it wanted)
      drift = Math.abs(tr.bend(k.seg, 16)) > 0.08 && k.counterT < 0.2 && !(k.tier >= tierWant && Math.abs(tr.bend(k.seg, 12)) < 0.16);
    } else drift = inBend && k.willDrift && sp > 16 && Math.abs(steer) > 0.35 && !k.on;
    let use = false;
    if (k.item && k.roll <= 0) {
      k.useT -= h;
      if (k.useT <= 0) {
        const st = this.order;
        const place = st.indexOf(k.seat);
        if (k.item === "turbo" || k.item === "turbo3") {
          use = Math.abs(bend) < 0.35 && !k.air && !k.on;
          if (use) k.useT = 0.8;
        } else if (k.item === "rug") {
          const behind = place < 3 ? this.karts[st[place + 1]] : null;
          use = !behind || (k.prog - behind.prog < 22 && k.prog - behind.prog > 3) || k.useT < -6;
        } else if (k.item === "zap") use = place > 0 && this.karts[st[place - 1]].prog - k.prog < 90;
        else if (k.item === "attack") use = place > 0;
        else if (k.item === "quantum") use = Math.abs(bend) < 0.4 || place > 1;
        if (k.useT < -10) use = true;
      }
    }
    c.steer = steer;
    c.drift = drift;
    c.use = use;
    return c;
  }

  // ---- what is seen ---------------------------------------------------------------------------

  private pose(k: Kart, dt: number) {
    const tr = this.trk;
    const hop = k.hop > 0 ? Math.sin((1 - k.hop / 0.24) * Math.PI) * 0.35 : 0;
    k.a.pos.set(k.x, k.y + hop, k.z);
    k.a.yaw = k.yaw;
    k.a.floor = k.y;
    k.kick = Math.max(0, k.kick - dt * 2.2);
    // the suspension: a spring under the body
    if (dt > 0) {
      k.bounceV += (-k.bounce * 160 - k.bounceV * 14) * dt;
      k.bounce += k.bounceV * dt;
    }
    k.body.position.y = clamp(k.bounce, -0.25, 0.2);
    const j = tr.wrap(k.seg + 3 / STEP),
      j0 = tr.wrap(k.seg - 3 / STEP);
    const fwd = Math.sign(Math.sin(k.yaw) * k.ftx + Math.cos(k.yaw) * k.ftz || 1);
    const pitch = k.air ? -Math.atan2(k.vy, Math.max(6, Math.abs(k.speed))) * 0.8 : k.on ? 0 : -Math.atan2(tr.py[j] - tr.py[j0], 6) * fwd;
    const trick = k.trick ? clamp(k.trickT / 0.42, 0, 1) * Math.PI * 2 : 0;
    const flip = k.flip > 0 ? clamp(k.airT / 0.7, 0, 1) * Math.PI * 2 : 0;
    // (a boost lifts the nose a touch)
    const nose = k.boost > 0 ? -0.05 * Math.min(1, k.boost * 2) : 0;
    k.tilt.rotation.set(pitch + flip + nose, -k.slide + (k.spin > 0 ? k.spinA : 0), k.steer * 0.08 * clamp(k.speed / VMAX, 0, 1) + (k.drift ? k.drift * 0.1 : 0) + trick, "YXZ");
    // the hands on the wheel (both up: done, or a trick)
    const st = k.steer;
    if (k.done >= 0 || k.trick) {
      const wv = Math.sin(this.wall * 9) * 0.3;
      k.a.body.armR.rotation.set(-2.8 + wv, 0, 0.3);
      k.a.body.armL.rotation.set(-2.8 - wv, 0, -0.3);
    } else {
      k.a.body.armR.rotation.set(-1.15 - st * 0.12, 0, 0.2);
      k.a.body.armL.rotation.set(-1.15 + st * 0.12, 0, -0.2);
    }
    k.a.body.foreArmR.rotation.set(-0.35, 0, 0);
    k.a.body.foreArmL.rotation.set(-0.35, 0, 0);
    k.angryT -= dt;
    k.a.angry = k.angryT > 0;
    k.a.sync(dt, this.wall);
    if (dt <= 0 || k.respawn > 0) return;
    // (the effects only near the camera: nobody sees the far ones)
    const focus = this.human ?? this.leader();
    if (k !== focus && Math.hypot(k.x - focus.x, k.z - focus.z) > 70) return;
    const sx = Math.sin(k.yaw),
      sz = Math.cos(k.yaw);
    const sp = Math.abs(k.speed);
    // the drift's sparks (the tier's colour) and skid marks from the back wheels
    if (k.drift && !k.air) {
      const cols = C_TIER[k.tier];
      const n = k.tier === 0 ? 1 : k.tier;
      for (let sd = -1; sd <= 1; sd += 2) this.fx.burst(v1.set(k.x - sx * 0.9 - sz * sd * 0.88, k.y + 0.14, k.z - sz * 0.9 + sx * sd * 0.88), n, cols, fxo(3 + k.tier, 2.5, 12, 0.08 + k.tier * 0.035, 0.28 + k.tier * 0.05, -sx * 3, 0, -sz * 3));
      if (k.tier === 0 && Math.random() < 0.5) this.fx.burst(v1.set(k.x - sx * 1.1, k.y + 0.2, k.z - sz * 1.1), 1, C_SMOKE, fxo(1, 1, -2, 0.17, 0.4));
      k.skidT -= dt;
      if (k.skidT <= 0 && Math.abs(k.lat) < tr.half + 1 && !k.on) {
        k.skidT = 0.03;
        for (let sd = -1; sd <= 1; sd += 2) {
          v1.set(k.x - sx * 0.85 - sz * sd * 0.9, k.y + 0.05, k.z - sz * 0.85 + sx * sd * 0.9);
          q1.setFromAxisAngle(UPV, k.yaw - k.slide);
          q2.setFromAxisAngle(XV, -Math.PI / 2);
          q1.multiply(q2);
          this.skids.setMatrixAt(this.skidN % 700, m4.compose(v1, q1, sc1.set(0.32, 1.25, 1)));
          this.skidN++;
        }
        this.skids.count = Math.min(700, this.skidN);
        this.skids.instanceMatrix.needsUpdate = true;
      }
    }
    // exhaust puffs (fire on a boost), dust off the back wheels, grass off the road
    k.puffT -= dt;
    if (k.puffT <= 0) {
      k.puffT = k.boost > 0 ? 0.03 : 0.11 - Math.min(0.06, sp * 0.002);
      for (let sd = -1; sd <= 1; sd += 2) {
        v1.set(k.x - sx * 1.6 - sz * sd * 0.4, k.y + 0.65, k.z - sz * 1.6 + sx * sd * 0.4);
        if (k.boost > 0) this.fx.burst(v1, 1, k.boostC >= 1 && k.boostC <= 3 ? C_TIER[k.boostC] : C_FIRE, fxo(1.2, 0.8, -1, 0.13, 0.26, -sx * 5, 0, -sz * 5));
        else this.fx.burst(v1, 1, C_SMOKE, fxo(0.6, 1.2, -2.5, 0.1 + (sp < 8 ? 0.08 : 0), 0.5, -sx * 2, 0, -sz * 2));
      }
    }
    if (!k.air && sp > 14) {
      const offR = k.offT > 0;
      if (offR || Math.random() < dt * (sp > 28 ? 6 : 3)) {
        const sd = Math.random() < 0.5 ? -1 : 1;
        this.fx.burst(v1.set(k.x - sx * 1.0 - sz * sd * 0.9, k.y + 0.15, k.z - sz * 1.0 + sx * sd * 0.9), offR ? 2 : 1, offR ? (this.course.offColors ?? C_GRASS) : (this.course.dust ?? C_DUST), fxo(1.5, offR ? 3.5 : 1.0, offR ? 14 : 4, offR ? 0.13 : 0.06, 0.4, -sx * sp * 0.15, 0, -sz * sp * 0.15));
      }
    }
    // a wet road throws spray off the back wheels; ice, a glitter of frost
    if (!k.air && sp > 12 && (this.course.theme.wet || k.ice > 0) && Math.random() < dt * (k.ice > 0 ? 30 : 22)) {
      const sd = Math.random() < 0.5 ? -1 : 1;
      this.fx.burst(v1.set(k.x - sx * 1.2 - sz * sd * 0.9, k.y + 0.25, k.z - sz * 1.2 + sx * sd * 0.9), 2, k.ice > 0 ? C_FROST : this.splashC, fxo(1.2, 1.6, 6, 0.1, 0.45, -sx * sp * 0.25, 0.5, -sz * sp * 0.25));
    }
    // smoke from a stalled start, wind round a slipstream
    if (k.stall > 0 && Math.random() < 0.7) this.fx.burst(v1.set(k.x - sx * 1.2, k.y + 0.3, k.z - sz * 1.2), 2, C_SMOKE, fxo(1.5, 1.5, -2, 0.22, 0.7));
    if (k.draft > 0.3 && Math.random() < 0.6) this.fx.burst(v1.set(k.x + (Math.random() - 0.5) * 2, k.y + 0.4 + Math.random() * 1.4, k.z + (Math.random() - 0.5) * 2), 1, C_SMOKE, fxo(0.2, 0, 0, 0.08, 0.25, -sx * 18, 0, -sz * 18));
  }

  /** The karts' instanced parts follow their bodies: tyres turn and steer, flames burn, glows glow. */
  private syncParts(dt: number) {
    for (let n = 0; n < this.karts.length; n++) {
      const k = this.karts[n];
      k.a.root.updateMatrixWorld(true);
      const bm = k.body.matrixWorld;
      const hidden = !k.a.root.visible;
      // the tyres and hubs
      k.wheelA = (k.wheelA + ((k.stall > 0 ? 40 : k.speed) * dt) / 0.37) % (Math.PI * 2);
      for (let w = 0; w < 4; w++) {
        const [wx, wz, ww] = WHEELS[w];
        q1.setFromAxisAngle(UPV, w < 2 ? -k.steer * 0.45 : 0).multiply(q2.setFromAxisAngle(XV, k.wheelA));
        m5.compose(v1.set(wx, 0.36, wz), q1, sc1.set(1, 1, 1));
        m6.multiplyMatrices(bm, m5);
        m4.compose(ZERO, TYRE_R, hidden ? sc1.set(0, 0, 0) : sc1.set(0.74, ww, 0.74));
        this.tyres.setMatrixAt(n * 4 + w, m5.multiplyMatrices(m6, m4));
        m4.compose(ZERO, q3.identity(), hidden ? sc1.set(0, 0, 0) : sc1.set(ww + 0.02, 0.28, 0.28));
        this.hubs.setMatrixAt(n * 4 + w, m5.multiplyMatrices(m6, m4));
      }
      // the flames out of the pipes (the boost's colour), their white-hot cores
      const on = k.boost > 0 && !hidden;
      const pw = on ? clamp(k.boost * 2.5, 0.35, 1) * (0.75 + (k.boostP - 1) * 1.6) : 0;
      const bc = k.quantum > 0 ? -1 : k.boostC;
      if (bc < 0) col1.setHSL((this.wall * 1.5) % 1, 1, 0.6);
      else col1.set(bc >= 1 && bc <= 3 ? TIER_C[bc] : "#ff7b1a");
      for (let e = 0; e < 2; e++) {
        const sd = e ? 1 : -1;
        const len = pw * (1.1 + Math.random() * 0.8);
        q1.setFromAxisAngle(XV, -Math.PI / 2);
        m5.compose(v1.set(sd * 0.4, 0.62, -1.55 - len / 2), q1, on ? sc1.set(0.36 * Math.max(0.6, pw), len, 0.36 * Math.max(0.6, pw)) : sc1.set(0, 0, 0));
        this.flames.setMatrixAt(n * 2 + e, m6.multiplyMatrices(bm, m5));
        this.flames.setColorAt(n * 2 + e, col1);
        m5.compose(v1.set(sd * 0.4, 0.62, -1.5 - len * 0.3), q1, on ? sc1.set(0.18, len * 0.55, 0.18) : sc1.set(0, 0, 0));
        this.cores.setMatrixAt(n * 2 + e, m6.multiplyMatrices(bm, m5));
      }
      // the drift's glow at the back wheels
      const gl = k.drift && k.tier > 0 && !k.air && !hidden;
      const gs = gl ? 0.35 + k.tier * 0.14 + Math.random() * 0.12 : 0;
      for (let e = 0; e < 2; e++) {
        m5.compose(v1.set(e ? 0.95 : -0.95, 0.25, -0.85), q3.identity(), sc1.setScalar(gs));
        this.glows.setMatrixAt(n * 2 + e, m6.multiplyMatrices(bm, m5));
        this.glows.setColorAt(n * 2 + e, col1.set(TIER_C[k.tier]));
      }
      // the shadow on the ground under it
      const tr = this.trk;
      const gy = k.on ? (k.gnd === WATER ? WATER : 0) : tr.gap[k.seg] ? WATER : tr.py[k.seg];
      const up = Math.max(0, k.y - gy);
      const ss = hidden ? 0 : Math.max(0.35, 1 - up * 0.1);
      q1.setFromAxisAngle(UPV, k.yaw).multiply(q2.setFromAxisAngle(XV, -Math.PI / 2));
      this.shadows.setMatrixAt(n, m4.compose(v1.set(k.x, gy + 0.06, k.z), q1, sc1.set(2.2 * ss, 3.3 * ss, 1)));
    }
    for (const m of [this.tyres, this.hubs, this.flames, this.cores, this.glows, this.shadows]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  private spinProps(dt: number) {
    const t = this.wall;
    for (let n = 0; n < this.boxes.length; n++) {
      const b = this.boxes[n];
      if (b.off > 0) b.off -= dt;
      const on = b.off <= 0;
      q1.setFromEuler(me.set(Math.sin(t * 1.2 + b.d) * 0.25, t * 1.6 + b.d, 0));
      const y = b.y + Math.sin(t * 2.5 + b.d) * 0.15;
      // (a box that was just taken grows back)
      const g = on ? Math.min(1, -b.off * 4 + 1) : 0;
      this.boxMesh.setMatrixAt(n, m4.compose(v1.set(b.x, y, b.z), q1, sc1.setScalar(1.15 * g)));
      this.boxInk.setMatrixAt(n, m4.compose(v1, q1, sc1.setScalar(1.24 * g)));
    }
    this.boxMesh.instanceMatrix.needsUpdate = true;
    this.boxInk.instanceMatrix.needsUpdate = true;
    if (this.padTex) this.padTex.offset.y = -t * 1.8;
    if (this.water) this.water.offset.set(t * this.course.theme.waterDrift[0], t * this.course.theme.waterDrift[1]);
    if (this.coinMesh) {
      q2.setFromAxisAngle(XV, Math.PI / 2);
      for (let n = 0; n < this.coins.length; n++) {
        const c = this.coins[n];
        if (c.off > 0) c.off -= dt;
        const on = c.off <= 0;
        q1.setFromAxisAngle(UPV, t * 3 + n * 0.4).multiply(q2);
        this.coinMesh.setMatrixAt(n, m4.compose(v1.set(c.x, c.y + Math.sin(t * 3 + n) * 0.12, c.z), q1, on ? sc1.set(0.84, 0.12, 0.84) : sc1.set(0, 0, 0)));
      }
      this.coinMesh.instanceMatrix.needsUpdate = true;
    }
    let w = 0;
    for (let n = 0; n < this.rugs.length; n++) {
      const r = this.rugs[n];
      r.life -= dt;
      if (r.life <= 0) {
        if (r.m.parent) r.m.removeFromParent();
        continue;
      }
      this.rugs[w++] = r;
    }
    this.rugs.length = w;
    w = 0;
    for (let n = 0; n < this.shots.length; n++) {
      const z = this.shots[n];
      if (z.life <= 0) {
        z.m.removeFromParent();
        continue;
      }
      this.shots[w++] = z;
    }
    this.shots.length = w;
    const kit = this.kit;
    for (let n = 0; n < kit.crowds.length; n++) kit.crowds[n].position.y = Math.abs(Math.sin(t * 6 + n * 1.7)) * 0.2;
    for (const sp of kit.spinners) sp.o.rotation.y = t * sp.k;
    // (the clouds drift on the wind)
    if (kit.cloudMesh) kit.cloudMesh.position.x = t * 0.7;
    for (let n = 0; n < kit.anims.length; n++) kit.anims[n](t, dt);
  }

  /** Air streaks round the camera's kart: thin white lines rushing past, more the faster it goes. */
  private windTick(k: Kart) {
    const sp = Math.abs(k.speed) / VMAX;
    const vis = clamp((sp - 0.62) / 0.4, 0, 1) * 0.3 + (k.boost > 0 ? 0.3 : 0) + k.kick * 0.2;
    this.windMat.opacity = Math.min(0.6, vis);
    const fx = Math.sin(this.camYaw),
      fz = Math.cos(this.camYaw);
    const p = this.windP;
    q1.setFromAxisAngle(UPV, this.camYaw);
    const len = 1.5 + Math.abs(k.speed) * 0.16;
    for (let n = 0; n < 40; n++) {
      let ax = (p[n * 4] - k.x) * fx + (p[n * 4 + 2] - k.z) * fz;
      if (ax < -10 || ax > 90) {
        const a = 30 + Math.random() * 55;
        const side = (Math.random() < 0.5 ? -1 : 1) * (2.8 + Math.random() * 7);
        p[n * 4] = k.x + fx * a - fz * side;
        p[n * 4 + 2] = k.z + fz * a + fx * side;
        p[n * 4 + 1] = k.y + 0.4 + Math.random() * 4.5;
        p[n * 4 + 3] = 0.6 + Math.random() * 0.8;
        ax = a;
      }
      const s = vis > 0.01 ? p[n * 4 + 3] : 0;
      this.wind.setMatrixAt(n, m4.compose(v1.set(p[n * 4], p[n * 4 + 1], p[n * 4 + 2]), q1, sc1.set(0.045 * s, 0.045 * s, len * s)));
    }
    this.wind.instanceMatrix.needsUpdate = true;
  }

  /** The human's finish: fireworks over the line. */
  private fireworksTick(dt: number) {
    if (this.fireworks < 0) return;
    const before = this.fireworks;
    this.fireworks += dt;
    const me = this.human;
    if (!me) return;
    for (const at of [0.05, 0.35, 0.6, 0.9, 1.2]) {
      if (before < at && this.fireworks >= at) {
        const a = Math.random() * Math.PI * 2;
        v1.set(me.x + Math.sin(me.yaw) * 22 + Math.cos(a) * 10, me.y + 14 + Math.random() * 8, me.z + Math.cos(me.yaw) * 22 + Math.sin(a) * 10);
        const c = ["#ff6b35", "#3ec6ff", "#8ee35b", "#ff5fa2", "#ffd23f"][Math.floor(Math.random() * 5)];
        this.fx.burst(v1, 70, [c, "#ffffff", c], { speed: 13, up: 0, gravity: 4, size: 0.3, life: 1.5, drag: 1.4 });
        sfx.thud();
      }
    }
  }

  /** The chase camera: low behind the kart, lagging, pulled back by speed and boosts, leaning into drifts. */
  private chase(k: Kart, dt: number, snap: boolean, kk = 18) {
    const sp = Math.abs(k.speed) / VMAX;
    const yaw = k.yaw - k.slide * 0.42;
    this.camYaw += turn(this.camYaw, yaw) * (snap ? 1 : Math.min(1, (3.4 + Math.min(1, sp) * 1.6) * dt));
    // (further back at speed, more on a boost's punch; the gap eases so the kart surges away)
    const want = 4.6 + 1.5 * Math.min(1, sp) + (k.boost > 0 ? 0.6 : 0) + k.kick * 1.4;
    this.camBack += (want - this.camBack) * (snap ? 1 : Math.min(1, (want > this.camBack ? 5 : 2.5) * dt));
    const back = this.camBack;
    const fx = Math.sin(this.camYaw),
      fz = Math.cos(this.camYaw);
    // (past the line: it swings round to the front, at a steady distance, to see the driver cheer)
    const orbit = k.done >= 0 ? Math.min(1, (this.t - k.done) / 1.4) : 0;
    const side = k.lat > 0 ? 1 : -1;
    const e = easeOut(orbit);
    const th = this.camYaw + Math.PI * (1 - e) + 0.6 * side * e;
    const rad = back + (7.5 - back) * e;
    const ox = Math.sin(th) * rad,
      oz = Math.cos(th) * rad;
    // (its height follows the kart more slowly in the air: a landing has weight)
    const tr = this.trk;
    const gy = k.on || tr.gap[k.seg] ? 0 : tr.py[k.seg];
    // (the sun's shadow map is fitted to the ground the camera looks at: up on a bridge, that is the deck)
    this.w.scene.userData.shadowY = gy;
    const lift = k.air ? Math.min(2, k.y - gy) * 0.35 : 0;
    let ey = k.y + 2.0 + 0.45 * Math.min(1, sp) - orbit * 0.6 + lift;
    if (tr.tunnel[k.seg]) ey = Math.min(ey, tr.py[k.seg] + 6.2);
    if (tr.roof[k.seg]) ey = Math.min(ey, tr.roof[k.seg] - 0.8);
    this.camY = snap ? ey : this.camY + (ey - this.camY) * Math.min(1, (k.air ? 4 : 9) * dt);
    v1.set(k.x + ox, this.camY, k.z + oz);
    const ahead = 4.5 + Math.min(1, sp) * 2.5;
    v2.set(k.x + fx * ahead * (1 - orbit), k.y + 1.05 - orbit * 0.1, k.z + fz * ahead * (1 - orbit));
    if (snap) this.cam.set(v1, v2);
    else this.cam.to(v1, v2, dt, orbit > 0 ? 14 : kk, kk * 1.3);
    // the field of view widens with speed, punches on a boost
    this.fovKick = Math.max(0, this.fovKick - dt * 2.4);
    const fov = 60 + 12 * Math.min(1, sp) + 8 * clamp((sp - 1) / 0.5, 0, 1) + 10 * easeOut(this.fovKick) + (k.quantum > 0 ? 4 : 0);
    this.w.camera.fov += (fov - this.w.camera.fov) * Math.min(1, (fov > this.w.camera.fov ? 9 : 3) * dt);
    // the lean into a drift
    const roll = orbit > 0 ? 0 : -k.drift * 0.065 - k.steer * 0.022 * Math.min(1, sp);
    this.roll += (roll - this.roll) * Math.min(1, 5 * dt);
  }

  private startEngine() {
    const a = sound();
    if (!a || this.engine || !this.human) return;
    const ac = a.ac;
    const o = ac.createOscillator();
    const o2 = ac.createOscillator();
    const o3 = ac.createOscillator();
    o.type = "sawtooth";
    o2.type = "square";
    o3.type = "triangle";
    const f = ac.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 600;
    const g = ac.createGain();
    g.gain.value = 0.0001;
    const g3 = ac.createGain();
    g3.gain.value = 0.0001;
    o.connect(f);
    o2.connect(f);
    f.connect(g).connect(a.bus);
    o3.connect(g3).connect(a.bus);
    // the drift's screech: a loop of noise through a band-pass
    const buf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const nz = ac.createBufferSource();
    nz.buffer = buf;
    nz.loop = true;
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2400;
    bp.Q.value = 3;
    const ng = ac.createGain();
    ng.gain.value = 0.0001;
    nz.connect(bp).connect(ng).connect(a.bus);
    o.start();
    o2.start();
    o3.start();
    nz.start();
    this.engine = { o, o2, o3, g, g3, f, nz, ng };
  }

  private engineTone() {
    const e = this.engine;
    const k = this.human;
    if (!e || !k) return;
    const sp = Math.abs(k.speed) / VMAX;
    const now = e.o.context.currentTime;
    const boost = k.boost > 0 ? 1 : 0;
    const quiet = this.over || k.done >= 0;
    e.o.frequency.setTargetAtTime(46 + sp * 105 + boost * 38 + (k.air ? 22 : 0), now, 0.05);
    e.o2.frequency.setTargetAtTime(23 + sp * 52 + boost * 18, now, 0.05);
    e.o3.frequency.setTargetAtTime(180 + sp * 420 + boost * 160, now, 0.06);
    e.f.frequency.setTargetAtTime(380 + sp * 1000 + boost * 700, now, 0.05);
    e.g.gain.setTargetAtTime(quiet ? 0.0001 : 0.05 + sp * 0.04 + boost * 0.02, now, 0.08);
    e.g3.gain.setTargetAtTime(quiet ? 0.0001 : 0.004 + sp * sp * 0.014 + boost * 0.012, now, 0.08);
    e.ng.gain.setTargetAtTime(!quiet && k.drift && !k.air ? 0.035 + k.tier * 0.012 : 0.0001, now, 0.04);
  }

  view() {
    return this.w;
  }

  /** What the bench reads after a race. */
  stats() {
    return this.karts.map((k) => ({ seat: k.seat, skill: k.skill, laps: k.laps.map((x) => +x.toFixed(1)), coins: k.coins, ...k.st, mt: k.st.mt.slice(1) }));
  }

  // ---- the HUD --------------------------------------------------------------------------------

  draw(g: CanvasRenderingContext2D, t: number) {
    const dt = clamp(t - this.lastDraw, 0, 0.1);
    this.lastDraw = t;
    const me = this.human;
    const st = this.order;
    const focus = me ?? this.leader();
    this.speedLines(g, focus, dt);
    for (const k of this.karts) {
      if (k === me || k.respawn > 0) continue;
      if (Math.hypot(k.x - focus.x, k.z - focus.z) > 80) continue;
      const s = toScreen(v1.set(k.x, k.y + 2.3, k.z), this.w.camera);
      if (s.on) tag(g, k.p, s.x, s.y);
    }
    if (this.drops > 0) this.drawDrops(g, this.drops);
    if (this.flashK > 0.01) {
      g.fillStyle = `rgba(230,235,255,${(this.flashK * 0.55).toFixed(3)})`;
      g.fillRect(0, 0, W, H);
      this.flashK *= Math.exp(-6 * dt);
    }
    if (this.phase === "count") return this.drawCount(g, t);
    this.drawLap(g, t, focus);
    this.drawSlot(g, t, focus);
    this.drawMap(g, t);
    this.drawBoard(g, st);
    this.drawGauge(g, t, focus);
    if (me) {
      const place = st.indexOf(me.seat);
      if (place !== this.lastPlace) {
        if (this.lastPlace >= 0 && this.t > 1) {
          this.placeDir = place < this.lastPlace ? 1 : -1;
          this.placePop = 1;
          if (place < this.lastPlace) sfx.blip(4);
          if (place === 0 && this.t > 4 && me.done < 0 && this.say.t > 0.8) (this.shout(T("TAKE THE LEAD!", "领先了！"), "#ffd23f"), sfx.coin());
        }
        this.lastPlace = place;
      }
      this.drawPlace(g, t, place);
      if (me.wrongT > 0.8 && me.done < 0) banner(g, T("WRONG WAY!", "方向错了！"), 0.5, "#ff5f5f", H * 0.4, 46);
      if (this.warn > 0 && me.done < 0) {
        g.globalAlpha = 0.6 + Math.sin(t * 18) * 0.4;
        rr(g, W / 2 - 170, 146, 340, 40, 20);
        g.fillStyle = "rgba(200,20,50,0.9)";
        g.fill();
        text(g, T("⚠ 51% ATTACK INCOMING!", "⚠ 51% 攻击来袭！"), W / 2, 167, 16, "#fff", "center", 900);
        g.globalAlpha = 1;
      }
      if (me.ice > 0 && me.done < 0) {
        g.globalAlpha = 0.65 + Math.sin(t * 12) * 0.35;
        shout(g, T("❄ ICE!", "❄ 结冰！"), HUD.thumbs ? W / 2 : 92, H - 158, 20, "#bfefff");
        g.globalAlpha = 1;
      }
      if (me.draft > 0.3 && me.boost <= 0) {
        g.globalAlpha = clamp(me.draft / 1.2, 0, 1);
        text(g, T("SLIPSTREAM…", "尾流中…"), W / 2, H - 112, 15, "#bfefff", "center", 900);
        g.globalAlpha = 1;
      }
      if (this.t < 6 && me.done < 0) {
        g.globalAlpha = clamp(6 - this.t, 0, 1);
        grow(g, W / 2 + 40, H - 16, 13, () => {
          rr(g, W / 2 + 40 - 228, H - 46, 456, 30, 15);
          g.fillStyle = "rgba(12,9,28,0.78)";
          g.fill();
          // (a touch screen's buttons carry their verbs: the hint names them)
          text(g, touchy() ? T(`Stick steers · hold ${A_WORD()} in a turn · ${B_WORD()} uses the item`, `摇杆转向 · 弯道按住「${A_WORD()}」· 「${B_WORD()}」使用道具`) : T("◀ ▶ steer · hold SPACE in a turn to drift · X uses the item", "◀ ▶ 转向 · 弯道按住空格漂移 · X 使用道具"), W / 2 + 40, H - 30, 13, "#fff", "center", 800);
        });
        g.globalAlpha = 1;
      }
      if (this.hurry >= 0) {
        rr(g, W / 2 - 60, 196, 120, 44, 22);
        g.fillStyle = "rgba(200,30,40,0.88)";
        g.fill();
        shout(g, String(Math.ceil(this.hurry)), W / 2, 219, 30, "#fff");
      }
    }
    if (this.finalT < 1) this.drawFinal(g, this.finalT);
    this.drawGust(g, t, focus);
    banner(g, this.say.s, this.say.t, this.say.c, this.say.y, 50);
    // the course's name at GO
    if (this.introT < 3) {
      const k = this.introT / 3;
      banner(g, T(this.course.title, this.course.titleZh), clamp(0.12 + k * 0.88, 0, 0.999), this.course.theme.night ? "#7ff3ff" : "#ffffff", H * 0.22, 44);
    }
  }

  /** The gusts: a wind sock and its warning while the visitor is on the windy stretch (or nearly). */
  private drawGust(g: CanvasRenderingContext2D, t: number, k: Kart) {
    const W0 = this.trk.spec.wind;
    if (!W0 || k.done >= 0) return;
    let near = false;
    for (let m = 0; m <= 80 && !near; m += 10) near = !!this.trk.windy[this.trk.wrap(k.seg + m / STEP)];
    if (!near) return;
    const gs = this.gust;
    const x = W / 2,
      y = 142;
    const words = gs.k > 0 ? T("GUST!", "阵风！") : gs.warn > 0 ? T("WIND COMING", "风要来了") : T("WINDY", "大风");
    // (the pill is as wide as its words: the sock on their left, the arrow on their right)
    g.font = `900 ${fpx(15)}px ${FONT}`;
    const tw = g.measureText(words).width;
    const hw = tw / 2 + 52;
    g.save();
    const a = gs.k > 0 ? 1 : gs.warn > 0 ? 0.55 + 0.45 * Math.abs(Math.sin(t * 10)) : 0.55;
    g.globalAlpha = a;
    rr(g, x - hw, y - 18, hw * 2, 36, 18);
    g.fillStyle = gs.k > 0 ? "rgba(40,110,200,0.88)" : gs.warn > 0 ? "rgba(200,120,20,0.88)" : "rgba(12,9,28,0.7)";
    g.fill();
    // (the sock: which way it will blow, across the screen)
    const dir = gs.side * (Math.cos(this.camYaw - k.yaw) >= 0 ? 1 : -1);
    const sx = x - hw + 28;
    g.translate(sx, y);
    g.scale(-dir, 1);
    const flap = Math.sin(t * (gs.k > 0 ? 30 : 8)) * (gs.k > 0 ? 2 : 4);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = i % 2 ? "#ffffff" : "#ff5f3a";
      g.beginPath();
      g.moveTo(-10 + i * 7, -7 + i * 1.2);
      g.lineTo(-3 + i * 7, -6 + i * 1.5 + flap * 0.3 * i);
      g.lineTo(-3 + i * 7, 6 - i * 1.5 + flap * 0.3 * i);
      g.lineTo(-10 + i * 7, 7 - i * 1.2);
      g.fill();
    }
    g.restore();
    g.save();
    g.globalAlpha = a;
    text(g, words, x + 4, y + 1, 15, "#fff", "center", 900);
    text(g, dir > 0 ? "→" : "←", x + hw - 22, y + 1, 18, "#fff", "center", 900);
    g.restore();
  }

  /** Water on the lens: a few drops round the edges (a puddle's splash, the rain). */
  private drawDrops(g: CanvasRenderingContext2D, k: number) {
    g.save();
    const r = this.dropR;
    for (let i = 0; i < 14; i++) {
      const x = r[i * 3] * W,
        y = r[i * 3 + 1] * H,
        s = r[i * 3 + 2];
      g.globalAlpha = Math.min(1, k * 1.4) * 0.5;
      g.beginPath();
      g.ellipse(x, y + (1 - k) * 30 * s, 10 + s * 22, 12 + s * 26, 0, 0, Math.PI * 2);
      g.fillStyle = "rgba(200,230,255,0.28)";
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = "rgba(255,255,255,0.5)";
      g.stroke();
    }
    g.restore();
  }
  /** Where the drops sit (x, y, size; round the edges of the screen). */
  private dropR = (() => {
    const out = new Float32Array(14 * 3);
    for (let i = 0; i < 14; i++) {
      const edge = i % 4;
      out[i * 3] = edge === 0 ? Math.random() * 0.18 : edge === 1 ? 0.82 + Math.random() * 0.18 : Math.random();
      out[i * 3 + 1] = edge >= 2 ? (edge === 2 ? Math.random() * 0.2 : 0.8 + Math.random() * 0.2) : Math.random();
      out[i * 3 + 2] = Math.random();
    }
    return out;
  })();

  private resetLine(i: number, first = false) {
    const L = this.lines;
    L[i * 4] = Math.random() * Math.PI * 2;
    L[i * 4 + 1] = first ? 120 + Math.random() * 500 : 110 + Math.random() * 120;
    L[i * 4 + 2] = 0.8 + Math.random() * 0.9;
    L[i * 4 + 3] = 40 + Math.random() * 90;
  }

  /** Streaks rushing out from the middle of the screen, and a glow round the edges on a boost. */
  private speedLines(g: CanvasRenderingContext2D, k: Kart, dt: number) {
    const sp = Math.abs(k.speed) / VMAX;
    const I = clamp(clamp((sp - 0.8) / 0.35, 0, 1) * 0.55 + (k.boost > 0 ? 0.5 : 0) + k.kick * 0.35, 0, 1);
    if (!this.grads) {
      const mk = (c: string) => {
        const gr = g.createRadialGradient(W / 2, H * 0.46, H * 0.32, W / 2, H * 0.46, W * 0.62);
        gr.addColorStop(0, "rgba(0,0,0,0)");
        gr.addColorStop(1, c);
        return gr;
      };
      this.grads = [mk("rgba(255,255,255,0.5)"), mk("rgba(62,198,255,0.75)"), mk("rgba(255,140,30,0.75)"), mk("rgba(196,91,255,0.8)"), mk("rgba(255,120,30,0.75)"), mk("rgba(255,170,40,0.75)")];
    }
    if (k.boost > 0 && k.done < 0) {
      g.globalAlpha = clamp(k.boost * 2, 0, 1) * (0.55 + k.kick * 0.45);
      g.fillStyle = this.grads[k.quantum > 0 ? 3 : clamp(k.boostC, 0, 5)];
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
    }
    if (I <= 0.01 || k.done >= 0) return;
    const c = toScreen(this.cam.at, this.w.camera);
    const cx = clamp(c.x, W * 0.3, W * 0.7),
      cy = clamp(c.y, H * 0.25, H * 0.6);
    const L = this.lines;
    const v = 600 + sp * 900;
    g.save();
    g.strokeStyle = k.boost > 0 && k.boostC >= 1 && k.boostC <= 3 ? TIER_C[k.boostC] : "#ffffff";
    g.lineCap = "round";
    for (let i = 0; i < 48; i++) {
      L[i * 4 + 1] += v * L[i * 4 + 2] * dt;
      if (L[i * 4 + 1] > 640) this.resetLine(i);
      const a = L[i * 4],
        r = L[i * 4 + 1],
        len = L[i * 4 + 3] * (0.6 + I);
      const ca = Math.cos(a),
        sa = Math.sin(a) * 0.62;
      g.globalAlpha = I * clamp((r - 100) / 120, 0, 1) * (0.35 + 0.45 * L[i * 4 + 2] - 0.4);
      g.lineWidth = 1.5 + L[i * 4 + 2] * 2.2 * I;
      g.beginPath();
      g.moveTo(cx + ca * r, cy + sa * r);
      g.lineTo(cx + ca * (r + len), cy + sa * (r + len));
      g.stroke();
    }
    g.restore();
  }

  /** The countdown: the rocket start's window under the 3-2-1. */
  private drawCount(g: CanvasRenderingContext2D, t: number) {
    if (!this.human) return;
    const k = this.countK;
    const x = W / 2 - 160,
      y = H - 74,
      w = 320;
    g.save();
    rr(g, x - 14, y - 34, w + 28, 70, 18);
    g.fillStyle = "rgba(12,9,28,0.78)";
    g.fill();
    text(g, touchy() ? T(`Press ${A_WORD()} on the 1 → ROCKET START`, `在 1 时按「${A_WORD()}」→ 火箭起步`) : T("Press SPACE on the 1 → ROCKET START", "在 1 时按空格 → 火箭起步"), W / 2, y - 16, 14, "#fff", "center", 900);
    rr(g, x, y, w, 16, 8);
    g.fillStyle = "#2a2440";
    g.fill();
    rr(g, x + w * 0.62, y, w * 0.33, 16, 8);
    g.fillStyle = Math.sin(t * 16) > 0 ? "#8ee35b" : "#6bc43c";
    g.fill();
    text(g, "3", x + w * 0.16, y + 8, 11, "rgba(255,255,255,0.5)", "center", 900);
    text(g, "2", x + w * 0.5, y + 8, 11, "rgba(255,255,255,0.5)", "center", 900);
    text(g, "1", x + w * 0.8, y + 8, 11, "#1b3a10", "center", 900);
    const held = this.rocketHeld;
    g.fillStyle = held ? (this.rocketAt >= 0.62 ? "#ffd23f" : "#ff5f5f") : "#ffffff";
    g.fillRect(x + w * k - 2, y - 4, 4, 24);
    if (held && this.rocketAt >= 0 && this.rocketAt < 0.62) text(g, T("TOO EARLY! let go", "太早了！松开"), W / 2, y + 28, 13, "#ff8a8a", "center", 900);
    else if (held && this.rocketAt >= 0.62) text(g, T("HOLD IT!", "按住！"), W / 2, y + 28, 13, "#ffd23f", "center", 900);
    g.restore();
  }

  /** LAP 1/2 and the race's time, top left. */
  private drawLap(g: CanvasRenderingContext2D, t: number, k: Kart) {
    // (a small screen: the whole box grows about its corner until its small print reads, so its lines keep their places)
    zoom(g, 16, 14, lapK(), () => this.lapBox(g, t, k));
  }
  private lapBox(g: CanvasRenderingContext2D, t: number, k: Kart) {
    const lap = clamp(Math.floor(k.prog / this.trk.L) + 1, 1, this.trk.laps);
    const fin = lap === this.trk.laps && k.done < 0;
    g.save();
    rr(g, 16, 14, 166, 84, 20);
    g.fillStyle = "rgba(12,9,28,0.78)";
    g.fill();
    rr(g, 16, 14, 166, 84, 20);
    g.lineWidth = 3;
    g.strokeStyle = fin ? (Math.sin(t * 8) > 0 ? "#ffd23f" : "#ff8a3c") : "rgba(255,255,255,0.16)";
    g.stroke();
    text(g, fin ? T("FINAL LAP", "最后一圈") : T("LAP", "圈"), 32, 34, 13, fin ? "#ffd23f" : "rgba(255,255,255,0.7)", "left", 900);
    shout(g, `${lap}`, 64, 66, 46, "#fff");
    text(g, `/${this.trk.laps}`, 88, 74, 22, "rgba(255,255,255,0.75)", "left", 900);
    const tt = k.done >= 0 ? k.done : this.t;
    text(g, fmt(tt), 168, 36, 14, "#fff", "right", 800, '"Geist Mono", ui-monospace, monospace');
    const last = k.laps.length ? k.laps[k.laps.length - 1] : -1;
    if (last > 0) text(g, `${T("last", "上圈")} ${fmt(last)}`, 168, 58, 11, "rgba(255,255,255,0.6)", "right", 700);
    g.restore();
  }

  /** The item slot, top middle: the roulette spins, slows, lands. */
  private drawSlot(g: CanvasRenderingContext2D, t: number, k: Kart) {
    const x = W / 2,
      y = 60,
      s = 92;
    g.save();
    const pop = 1 + this.itemPop * 0.22;
    g.translate(x, y);
    g.scale(pop, pop);
    rr(g, -s / 2 - 4, -s / 2 - 4, s + 8, s + 8, 26);
    g.fillStyle = "#15101f";
    g.fill();
    rr(g, -s / 2, -s / 2, s, s, 22);
    const gr = (this.slotGrad ??= (() => {
      const q = g.createLinearGradient(0, -s / 2, 0, s / 2);
      q.addColorStop(0, "#3a2f73");
      q.addColorStop(1, "#1c1640");
      return q;
    })());
    g.fillStyle = gr;
    g.fill();
    rr(g, -s / 2, -s / 2, s, s, 22);
    g.lineWidth = 4;
    g.strokeStyle = k.item || k.roll > 0 ? "#ffd23f" : "rgba(255,255,255,0.25)";
    g.stroke();
    if (k.roll > 0) {
      // (the strip of items runs down and slows onto the one it gives)
      const p = 1 - k.roll / ROLL_T;
      const total = 14;
      const sc = total * easeOut(p);
      const fi = ITEMS.indexOf(k.rollItem);
      const base = Math.floor(sc);
      const frac = sc - base;
      if (k.p.human && base !== this.lastRollTick) ((this.lastRollTick = base), sfx.roll());
      rr(g, -s / 2 + 4, -s / 2 + 4, s - 8, s - 8, 18);
      g.clip();
      for (let m = -1; m <= 1; m++) {
        const idx = (((fi + total - base - m) % ITEMS.length) + ITEMS.length * 4) % ITEMS.length;
        icon(g, ITEMS[idx], 0, (frac + m) * 78, 0.9);
      }
    } else if (k.item) {
      icon(g, k.item, 0, -2, 1.05 + Math.sin(t * 8) * 0.04);
      if (k.item === "turbo3" && k.itemN > 1) shout(g, `×${k.itemN}`, 30, 30, 18, "#fff");
    } else text(g, "?", 0, 2, 40, "rgba(255,255,255,0.18)", "center", 900);
    g.restore();
    if (k.item && k.roll <= 0 && k.p.human) {
      // (how to use it: the key on a computer, the button's own word on a touch screen)
      rr(g, x - 30, y + s / 2 + 8, 60, 22, 11);
      g.fillStyle = "#ffd23f";
      g.fill();
      text(g, touchy() ? B_WORD() : "X", x, y + s / 2 + 20, 12, "#2a1a00", "center", 900);
    }
    if (k.quantum > 0) {
      rr(g, x - 46, y + s / 2 + 34, 92 * clamp(k.quantum / 6, 0, 1), 7, 3.5);
      g.fillStyle = `hsl(${(t * 400) % 360},100%,65%)`;
      g.fill();
    }
  }
  private slotGrad: CanvasGradient | null = null;

  /** The mini-map, top right: the figure of eight, the bridge over it, the four racers. */
  private drawMap(g: CanvasRenderingContext2D, t: number) {
    const mp = this.map;
    // (the hall's pause button sits on the frame's top right corner on some screens: the map stops short of it)
    const mx = mp.x - HUD.tr;
    g.save();
    rr(g, mx - mp.w / 2, mp.y - mp.h / 2, mp.w, mp.h, 20);
    g.fillStyle = "rgba(12,9,28,0.72)";
    g.fill();
    g.translate(mx, mp.y);
    g.lineJoin = "round";
    g.lineCap = "round";
    g.strokeStyle = "rgba(255,255,255,0.9)";
    g.lineWidth = 7;
    g.stroke(mp.path);
    g.strokeStyle = "#5b5d6b";
    g.lineWidth = 4;
    g.stroke(mp.path);
    if (mp.short) {
      g.setLineDash([3, 3]);
      g.strokeStyle = this.course.mapColors?.[1] ?? "#e0a062";
      g.lineWidth = 2.5;
      g.stroke(mp.short);
      g.setLineDash([]);
    }
    // (the bridge over the crossing, drawn on top)
    g.strokeStyle = "#15101f";
    g.lineWidth = 9;
    g.stroke(mp.deck);
    g.strokeStyle = "#ffffff";
    g.lineWidth = 7;
    g.stroke(mp.deck);
    g.strokeStyle = "#8d86a6";
    g.lineWidth = 4;
    g.stroke(mp.deck);
    // the line
    const tr = this.trk;
    const lx = (tr.px[0] - mp.cx) * mp.k,
      ly = (tr.pz[0] - mp.cz) * mp.k;
    g.fillStyle = "#ffffff";
    g.fillRect(lx - 1.5, ly - 5, 3, 10);
    for (const z of this.shots) {
      if (z.life <= 0) continue;
      g.beginPath();
      g.arc((z.x - mp.cx) * mp.k, (z.z - mp.cz) * mp.k, z.big ? 4 : 2.5, 0, Math.PI * 2);
      g.fillStyle = z.big ? "#ff3b5c" : "#7ff3ff";
      g.fill();
    }
    for (let n = this.karts.length - 1; n >= 0; n--) {
      const k = this.karts[this.order[n]];
      const X = (k.x - mp.cx) * mp.k,
        Y = (k.z - mp.cz) * mp.k;
      if (k.p.human) {
        g.beginPath();
        g.arc(X, Y, 8 + Math.sin(t * 6) * 1.5, 0, Math.PI * 2);
        g.fillStyle = "rgba(255,255,255,0.3)";
        g.fill();
      }
      g.beginPath();
      g.arc(X, Y, k.p.human ? 5.5 : 4.5, 0, Math.PI * 2);
      g.fillStyle = k.p.color;
      g.fill();
      g.strokeStyle = "#fff";
      g.lineWidth = k.p.human ? 2.5 : 1.5;
      g.stroke();
    }
    g.restore();
  }

  /** The standings down the left: places, portraits, colours. */
  private drawBoard(g: CanvasRenderingContext2D, st: number[]) {
    // (under the lap's box, however much it has grown)
    const x = 16,
      y0 = 112 + 84 * (lapK() - 1);
    for (let n = 0; n < st.length; n++) {
      const p = this.players[st[n]];
      const k = this.karts[st[n]];
      const y = y0 + n * 38;
      g.save();
      rr(g, x, y, 166, 32, 16);
      g.fillStyle = p.human ? p.color : "rgba(12,9,28,0.72)";
      g.fill();
      if (!p.human) {
        rr(g, x, y, 166, 32, 16);
        g.strokeStyle = p.color;
        g.lineWidth = 2;
        g.stroke();
      }
      // (the place in a round badge)
      g.beginPath();
      g.arc(x + 17, y + 16, 12, 0, Math.PI * 2);
      g.fillStyle = PLACE_C[n];
      g.fill();
      text(g, String(n + 1), x + 17, y + 17, 15, "#15101f", "center", 900);
      token(g, p, x + 46, y + 16, 13, { shadow: false });
      text(g, short(p), x + 66, y + 17, 14, "#fff", "left", 900);
      if (k.done >= 0) text(g, "🏁", x + 154, y + 17, 14, "#fff", "right");
      else if (k.item) icon(g, k.item, x + 150, y + 16, 0.3);
      g.restore();
    }
  }

  /** The speed gauge, bottom left: the needle, the km/h, the boost and the drift's charge, the coins. */
  private drawGauge(g: CanvasRenderingContext2D, t: number, k: Kart) {
    // (a touch screen: the bottom left is the stick's, so the gauge hangs under the mini-map)
    const cx = HUD.thumbs ? W - 86 : 92,
      cy = HUD.thumbs ? this.map.y + this.map.h / 2 + 84 : H - 70,
      r = 56;
    const sp = Math.abs(k.speed);
    const f = clamp(sp / (VMAX * 1.6), 0, 1);
    const a0 = Math.PI * 0.75,
      a1 = Math.PI * 2.25;
    g.save();
    g.beginPath();
    g.arc(cx, cy, r + 14, 0, Math.PI * 2);
    g.fillStyle = "rgba(12,9,28,0.78)";
    g.fill();
    g.lineCap = "round";
    g.lineWidth = 10;
    g.strokeStyle = "rgba(255,255,255,0.12)";
    g.beginPath();
    g.arc(cx, cy, r, a0, a1);
    g.stroke();
    // (the arc fills in the boost's colour, or from cool to hot)
    const boost = k.boost > 0;
    g.strokeStyle = boost ? (k.quantum > 0 ? `hsl(${(t * 400) % 360},100%,65%)` : k.boostC >= 1 && k.boostC <= 3 ? TIER_C[k.boostC] : "#ff8a1a") : f > 0.6 ? "#ffd23f" : "#3ec6ff";
    g.beginPath();
    g.arc(cx, cy, r, a0, a0 + (a1 - a0) * f);
    g.stroke();
    for (let i = 0; i <= 8; i++) {
      const a = a0 + ((a1 - a0) * i) / 8;
      g.strokeStyle = i >= 6 ? "#ff5f5f" : "rgba(255,255,255,0.55)";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * (r - 12), cy + Math.sin(a) * (r - 12));
      g.lineTo(cx + Math.cos(a) * (r - 6), cy + Math.sin(a) * (r - 6));
      g.stroke();
    }
    const na = a0 + (a1 - a0) * f + (boost ? Math.sin(t * 60) * 0.02 : 0);
    g.strokeStyle = "#ffffff";
    g.lineWidth = 3.5;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(na) * (r - 10), cy + Math.sin(na) * (r - 10));
    g.stroke();
    g.beginPath();
    g.arc(cx, cy, 6, 0, Math.PI * 2);
    g.fillStyle = "#ffffff";
    g.fill();
    // (a small screen: the unit's small print would grow into the figure; the dial says what it is)
    shout(g, String(Math.round(sp * 3.6)), cx, cy + (HUD.min ? 32 : 26), 24, boost ? "#ffd23f" : "#ffffff");
    if (!HUD.min) text(g, "km/h", cx, cy + 44, 10, "rgba(255,255,255,0.6)", "center", 800);
    // the drift's charge: a bar toward the next colour
    if (k.drift) {
      const tier = k.tier;
      const lo = TIER_AT[tier],
        hi = TIER_AT[Math.min(3, tier + 1)];
      const p = tier >= 3 ? 1 : clamp((k.charge - lo) / (hi - lo), 0, 1);
      // (a touch screen: the gauge is on the right edge, so the bar goes on its left)
      const bx = HUD.thumbs ? cx - r - 36 : cx + r + 22;
      rr(g, bx, cy - 38, 14, 76, 7);
      g.fillStyle = "rgba(12,9,28,0.78)";
      g.fill();
      rr(g, bx + 3, cy + 35 - 70 * p, 8, 70 * p, 4);
      g.fillStyle = TIER_C[Math.min(3, tier + (tier >= 3 ? 0 : 1))];
      g.fill();
      if (tier > 0) {
        g.beginPath();
        g.arc(bx + 7, cy - 46, 7, 0, Math.PI * 2);
        g.fillStyle = TIER_C[tier];
        g.fill();
      }
    }
    if (boost) {
      g.globalAlpha = 0.7 + Math.sin(t * 20) * 0.3;
      // (a touch screen: the mini-map is over the gauge, so the word goes on its left)
      shout(g, T("BOOST!", "加速！"), HUD.thumbs ? cx - r - 78 : cx, HUD.thumbs ? cy : cy - 86, 20, "#ffd23f");
      g.globalAlpha = 1;
    }
    g.restore();
    // the coins
    const cs = 1 + this.coinPop * 0.35;
    // (a touch screen: the gauge hangs on the right edge, so the coins sit under it, over A: A is
    // 84 px, its edge at most 24 px in, then 10 px of air, in canvas units at 12 / HUD.min a pixel)
    const qx = HUD.thumbs ? cx - 32 : cx + r + 56,
      qy = HUD.thumbs ? Math.min(cy + r + 36, H - ((24 + 84 + 10) * HUD.min) / 12 - 15) : H - 30;
    rr(g, qx - 14, qy - 15, 92, 30, 15);
    g.fillStyle = "rgba(12,9,28,0.78)";
    g.fill();
    g.save();
    g.translate(qx + 2, qy);
    g.scale(cs, cs);
    g.beginPath();
    g.arc(0, 0, 10, 0, Math.PI * 2);
    g.fillStyle = "#ffcf2e";
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = "#c98a00";
    g.stroke();
    text(g, "Z", 0, 1, 11, "#9a6200", "center", 900);
    g.restore();
    text(g, `${k.coins}`, qx + 22, qy + 1, 17, k.coins >= MAX_COINS ? "#ffd23f" : "#fff", "left", 900);
    text(g, `/${MAX_COINS}`, qx + 22 + (k.coins >= 10 ? 21 : 11), qy + 2, 11, "rgba(255,255,255,0.55)", "left", 800);
  }

  /** The place, bottom right: a big chunky "1st" in gold, silver, bronze, red. */
  private drawPlace(g: CanvasRenderingContext2D, t: number, place: number) {
    const big = String(place + 1);
    const suf = ord(place).replace(/^\d+/, "");
    // (a touch screen: A and B are in the bottom right, so the place goes up by the lap's panel)
    const x = HUD.thumbs ? 262 + 166 * (lapK() - 1) : W - 118,
      y = HUD.thumbs ? 66 : H - 66;
    g.save();
    const ps = 1 + easeOut(this.placePop) * 0.35;
    g.translate(x, y);
    g.rotate(-0.08 + Math.sin(t * 3) * 0.015);
    g.scale(ps, ps);
    g.font = `900 104px ${FONT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineJoin = "round";
    g.lineWidth = 16;
    g.strokeStyle = "#15101f";
    g.strokeText(big, 0, 0);
    g.lineWidth = 7;
    g.strokeStyle = "#ffffff";
    g.strokeText(big, 0, 0);
    if (!this.placeGrads) {
      this.placeGrads = PLACE_C.map((c, i) => {
        const q = g.createLinearGradient(0, -48, 0, 48);
        q.addColorStop(0, "#ffffff");
        q.addColorStop(0.35, c);
        q.addColorStop(1, PLACE_D[i]);
        return q;
      });
    }
    g.fillStyle = this.placeGrads[Math.min(3, place)];
    g.fillText(big, 0, 0);
    if (Array.from(suf).length < 4) {
      g.font = `900 34px ${FONT}`;
      g.lineWidth = 9;
      g.strokeStyle = "#15101f";
      g.strokeText(suf, 56, -28);
      g.fillStyle = "#ffffff";
      g.fillText(suf, 56, -28);
    }
    g.restore();
    if (this.placePop > 0 && this.placeDir) {
      g.globalAlpha = this.placePop;
      shout(g, this.placeDir > 0 ? "▲" : "▼", x - 78, y - 30, 30, this.placeDir > 0 ? "#8ee35b" : "#ff5f5f");
      g.globalAlpha = 1;
    }
  }
  private placeGrads: CanvasGradient[] | null = null;

  /** FINAL LAP: a chequered band sweeps across under the words. */
  private drawFinal(g: CanvasRenderingContext2D, k: number) {
    const inK = clamp(k / 0.14, 0, 1),
      outK = k > 0.8 ? (1 - k) / 0.2 : 1;
    const y = H * 0.32;
    g.save();
    g.globalAlpha = Math.min(inK, outK);
    g.translate(W / 2 + (1 - easeOut(inK)) * W, y);
    g.rotate(-0.06);
    g.fillStyle = "#15101f";
    g.fillRect(-W, -46, W * 2, 92);
    for (let i = -40; i < 40; i++)
      for (let j = 0; j < 2; j++) {
        g.fillStyle = (i + j) % 2 ? "#ffffff" : "#15101f";
        g.fillRect(i * 14, -46 + j * 7, 14, 7);
        g.fillRect(i * 14, 32 + j * 7, 14, 7);
      }
    g.restore();
    banner(g, T("FINAL LAP!", "最后一圈！"), clamp(k, 0.001, 0.999), "#ffd23f", y, 62);
    // (the lap just done, under it)
    const me = this.human;
    if (me && me.laps.length) {
      g.globalAlpha = Math.min(inK, outK);
      shout(g, `${T("LAP 1", "第一圈")}  ${fmt(me.laps[0])}`, W / 2, y + 74, 22, "#ffffff");
      g.globalAlpha = 1;
    }
  }

  result() {
    return this.over;
  }

  dispose() {
    if (this.engine) {
      const e = this.engine;
      try {
        const now = e.o.context.currentTime;
        e.g.gain.setTargetAtTime(0.0001, now, 0.05);
        e.g3.gain.setTargetAtTime(0.0001, now, 0.05);
        e.ng.gain.setTargetAtTime(0.0001, now, 0.03);
        e.o.stop(now + 0.3);
        e.o2.stop(now + 0.3);
        e.o3.stop(now + 0.3);
        e.nz.stop(now + 0.3);
      } catch {
        /* already stopped */
      }
      this.engine = null;
    }
    for (const k of this.karts) k.a.dispose();
    this.course.dispose?.();
    this.kit.ctx = null;
    this.kit.anims.length = 0;
    disposeScene(this.w.scene);
  }
}

/** How much the lap's box grows on a small screen (its labels, 13, read at the floor). */
const lapK = () => Math.min(1.4, fpx(13) / 13);

/** What the touch buttons are called here (acts.ts: DRIFT, ITEM). */
const A_WORD = () => actWord(actsOf("kart").a!);
const B_WORD = () => actWord(actsOf("kart").b!);

const PLACE_C = ["#ffd23f", "#dfe8f5", "#ffae6b", "#ff7b8a"];
const PLACE_D = ["#c98a00", "#8a9ab8", "#b8622a", "#b8283c"];

const toons = new Map<string, THREE.MeshToonMaterial>();
/** A shared cel material of this colour (kept for every race, like k3's own). */
function toonM(c: string) {
  let m = toons.get(c);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color: c, gradientMap: toonSteps() });
    m.userData = { shared: true };
    toons.set(c, m);
  }
  return m;
}
const glows = new Map<string, THREE.MeshBasicMaterial>();
function glowM(c: string, add = true) {
  const k = c + add;
  let m = glows.get(k);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: add ? 0.95 : 1, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !add });
    m.userData = { shared: true };
    glows.set(k, m);
  }
  return m;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

/** An item's picture in the slot. */
function icon(g: CanvasRenderingContext2D, it: Item, x: number, y: number, s: number) {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  const flame = (dx: number, k: number) => {
    g.fillStyle = "#ff6b1a";
    g.beginPath();
    g.moveTo(dx, -26 * k);
    g.bezierCurveTo(dx + 18 * k, -6 * k, dx + 20 * k, 10 * k, dx, 24 * k);
    g.bezierCurveTo(dx - 20 * k, 10 * k, dx - 18 * k, -6 * k, dx, -26 * k);
    g.fill();
    g.fillStyle = "#ffd23f";
    g.beginPath();
    g.moveTo(dx, -10 * k);
    g.bezierCurveTo(dx + 10 * k, 2 * k, dx + 10 * k, 12 * k, dx, 20 * k);
    g.bezierCurveTo(dx - 10 * k, 12 * k, dx - 10 * k, 2 * k, dx, -10 * k);
    g.fill();
  };
  if (it === "turbo") flame(0, 1);
  else if (it === "turbo3") {
    flame(-14, 0.6);
    flame(14, 0.6);
    flame(0, 0.75);
  } else if (it === "rug") {
    g.fillStyle = "#c2185b";
    g.fillRect(-24, -16, 48, 30);
    g.fillStyle = "#ffd23f";
    g.fillRect(-15, -8, 30, 14);
    g.fillStyle = "#c2185b";
    g.fillRect(-6, -3, 12, 4);
    g.fillStyle = "#ffd23f";
    for (let i = -4; i <= 4; i++) g.fillRect(i * 5.5 - 1, 14, 2, 6);
  } else if (it === "zap") {
    g.fillStyle = "#7ff3ff";
    g.beginPath();
    g.moveTo(6, -26);
    g.lineTo(-14, 4);
    g.lineTo(-1, 4);
    g.lineTo(-7, 26);
    g.lineTo(15, -6);
    g.lineTo(2, -6);
    g.closePath();
    g.fill();
    g.strokeStyle = "#ffffff";
    g.lineWidth = 2;
    g.stroke();
  } else if (it === "attack") {
    g.fillStyle = "#ff3b5c";
    g.beginPath();
    g.arc(0, 0, 22, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#ffd23f";
    g.lineWidth = 3;
    g.stroke();
    text(g, "51%", 0, 1, 15, "#fff", "center", 900);
  } else {
    // SHIELDED (the `quantum` item): a rainbow star
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 11 : 26;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    const gr = g.createLinearGradient(-26, -26, 26, 26);
    gr.addColorStop(0, "#ff5fa2");
    gr.addColorStop(0.33, "#ffd23f");
    gr.addColorStop(0.66, "#8ee35b");
    gr.addColorStop(1, "#3ec6ff");
    g.fillStyle = gr;
    g.fill();
    g.strokeStyle = "#fff";
    g.lineWidth = 2;
    g.stroke();
  }
  g.restore();
}
