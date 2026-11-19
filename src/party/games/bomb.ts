/**
 * HOT WALLET (烫手钱包): hot-potato tag high over a city. One player holds the HOT WALLET over their
 * head: a ticking voxel bomb-wallet stuffed with cash, its fuse hidden (6–11 s, from the seeded rnd)
 * but told by the wallet itself: it swells, glows redder, ticks faster and the music tenses. Touch a
 * rival (or tag them with the A dash) to pass it on: they hop, and you are safe from getting it straight
 * back for a moment. When it blows, its holder is blasted sky-high. Then a roulette hands a new wallet
 * to a survivor. Three blasts leave one winner; the order is the reverse of the blasts.
 *
 * Three levels (bomb-levels/), each its own floor and twist:
 * - NEON ROOFTOP: the classic square roof at golden hour, four props to run round;
 * - HAWKER NIGHT: a round hawker-centre plaza over Marina Bay; a turntable ring in the floor carries you
 *   round, and now and then flips its way (its arrows blink amber, it slows, stops, turns back);
 * - SKYBRIDGE: two Midtown tower roofs over a chasm; two drawbridges lift in turn (their lamps
 *   flash and a horn sounds first), and a spring pad on each lip hops you over.
 *
 * Arrows run (screen-relative), A dashes (a cooldown). The holder runs a little faster: the chase is fair.
 */
import * as THREE from "three";
import { T } from "../../i18n/lang";
import { H, HUD, W, backOut, clamp, grow, lerp, ord, rr, sfx, shout, sound, text, type Input, type Mini, type MiniDef, type Player, type Rnd } from "../kit";
import { actWord, actsOf } from "../acts";
import { touchy } from "../hud";
import { music } from "../music";
import { Avatar, CamRig, Fx3, GEO, banner, block, canvasTex, cornerSpot, corners, disposeScene, glow, outline, qTex, short, tag, toScreen, toonSteps, world, yawOf, type World } from "../k3";
import { HIT, outOfBox, pushApart, type Box2 } from "../phys";
import { poolTex, type Box, type Level, type Live, type Scenery } from "./bomb-levels/common";
import { ROOF } from "./bomb-levels/roof";
import { MARKET } from "./bomb-levels/market";
import { SKYBRIDGE } from "./bomb-levels/skybridge";

/** The levels, in the picker's order. */
export const LEVELS: Level[] = [ROOF, MARKET, SKYBRIDGE];

// ---- the rules -----------------------------------------------------------------------------------

/** A player's radius. */
const PR = 0.42;
/** Running speed (m/s), and the holder's edge. */
const SPEED = 6;
const HOLD_BOOST = 1.1;
/** The dash: its speed, how long it lasts, the wait before the next. */
const DASH_V = 14;
const DASH_T = 0.2;
const DASH_CD = 1.3;
/** A touch passes the wallet within this (centre to centre), further in a dash. */
const TAG_R = 0.95;
const TAG_DASH = 1.3;
/** Who just passed it can't get it back for this long; who just got it is dazed this long. */
const IMMUNE = 1.1;
const STUN = 0.35;
const START_STUN = 0.55;
/** The hidden fuse: 6–11 s. */
const FUSE_MIN = 6;
const FUSE_RANGE = 5;
/** After a blast: the pause before the next roulette; the last blast's wait before the result. */
const BLAST_T = 2.6;
const END_AT = 1.3;
/** The wallet over the holder's head (m above the feet). */
const HOLD_Y = 2.2;
/** The roulette: its hops (each a little slower), then the wallet's drop. */
const HOP0 = 0.07;
const HOP_K = 0.024;
const DROP = 0.32;
/** A hard cap on the play time (the fuses end it long before). */
const CAP = 95;
/** A spring pad's hop over the chasm: its time in the air (s); a drawbridge's swing up or down (s). */
const HOP_T = 0.7;
const SWING = 0.45;
/** A turntable flip: it slows to a stop over this long, and gets back up to speed over this long. */
const FLIP_STOP = 0.6;
const FLIP_GO = 0.5;

/** The AI's sixteen ways to go (context steering). */
const ND = 16;
const DX = new Float32Array(ND);
const DZ = new Float32Array(ND);
for (let k = 0; k < ND; k++) ((DX[k] = Math.sin((k / ND) * Math.PI * 2)), (DZ[k] = Math.cos((k / ND) * Math.PI * 2)));

/** The face to show (scene/ape/face.ts EXPR). */
const FACE = { surprised: 3, angry: 4, hurt: 7 };

const FIRE = ["#fff4b0", "#ffd23f", "#ff9a2e", "#ff5a1f", "#e8261b"];
const SMOKE = ["#8a7f9c", "#a69bb6", "#c4bad0"];
const CASH = ["#5fd35f", "#7ee57e", "#ffd23f", "#3fb34f"];
const SPARK = ["#fff6c0", "#ffd23f", "#ff9a2e"];
const C_COOL = new THREE.Color("#ff7a35");
const C_HOT = new THREE.Color("#e8101a");
const E_COOL = new THREE.Color("#3a1200");
const E_HOT = new THREE.Color("#7a0000");
const L_COOL = new THREE.Color("#ff8a3a");
const L_HOT = new THREE.Color("#ff2a1a");
const WHITE = new THREE.Color("#ffffff");
const PUFFS = ["#fff3a0", "#ffe14a", "#ffd23f", "#ffc23a", "#ffa62e", "#ff8a2e", "#ff7a2a", "#ff5a1f", "#f2431c", "#e8361b", "#ff9a2e", "#ff6b24"];

/** Each player's state. */
interface Seat {
  a: Avatar;
  vx: number;
  vz: number;
  /** In a dash for this long; the dash's cooldown. */
  dash: number;
  cd: number;
  dashX: number;
  dashZ: number;
  /** Where it stood before this frame's move (a prop is left by the side it was entered). */
  ox: number;
  oz: number;
  /** Your A pressed a moment too soon (stunned, the dash still cooling): it goes off as soon as it can. */
  buf: number;
  immune: number;
  stun: number;
  /** A hurt face for this long (the pass, the blast). */
  hurt: number;
  out: boolean;
  /** Seconds since blasted (−1: on the roof); gone: twinkled away. */
  fly: number;
  fvx: number;
  fvz: number;
  gone: boolean;
  // the AI's mind: its next think, the way it wants to go (and how hard), its victim, a panic
  think: number;
  gx: number;
  gz: number;
  gk: number;
  target: number;
  panic: number;
  want: boolean;
  wantX: number;
  wantZ: number;
  /** SKYBRIDGE: the roof it is on (−1 west, 1 east); in a spring's hop for this long. */
  side: number;
  hop: number;
  /** HAWKER NIGHT: the turntable's carry under it now (m/s). */
  cx: number;
  cz: number;
}

// ---- the synth -----------------------------------------------------------------------------------

/** The game's own sounds (the tick, the music, the boom) on one gain, cut on dispose. */
class Synth {
  private out: GainNode | null = null;
  private nbuf: AudioBuffer | null = null;
  private dead = false;

  ctx(): AudioContext | null {
    if (this.dead) return null;
    const s = sound();
    if (!s) return null;
    if (!this.out) {
      this.out = s.ac.createGain();
      this.out.gain.value = 1;
      this.out.connect(s.bus);
      const n = Math.floor(s.ac.sampleRate * 1.4);
      this.nbuf = s.ac.createBuffer(1, n, s.ac.sampleRate);
      const d = this.nbuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    return s.ac;
  }

  /** A note at audio time `at` (0: now). */
  tone(freq: number, dur: number, type: OscillatorType = "square", vol = 0.3, slide = 0, at = 0) {
    const a = this.ctx();
    if (!a || !this.out) return;
    const t = Math.max(a.currentTime, at || a.currentTime);
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** A burst of filtered noise. */
  noise(dur: number, vol: number, at = 0, type: BiquadFilterType = "highpass", freq = 1000) {
    const a = this.ctx();
    if (!a || !this.out || !this.nbuf) return;
    const t = Math.max(a.currentTime, at || a.currentTime);
    const s = a.createBufferSource();
    s.buffer = this.nbuf;
    const f = a.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = a.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.out);
    s.start(t, Math.random() * 0.2, dur + 0.05);
  }

  stop() {
    this.dead = true;
    const o = this.out;
    if (!o) return;
    this.out = null;
    try {
      o.gain.setTargetAtTime(0, o.context.currentTime, 0.03);
    } catch {
      /* closed */
    }
    setTimeout(() => o.disconnect(), 250);
  }
}

// ---- the textures --------------------------------------------------------------------------------

/** A four-point twinkle. */
function starTex() {
  return canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 2, 64, 64, 60);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.25, "rgba(255,240,170,0.8)");
    gr.addColorStop(1, "rgba(255,200,80,0)");
    g.fillStyle = gr;
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 ? 12 : 62;
      g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
  });
}

// ---- the game ------------------------------------------------------------------------------------

class HotWallet implements Mini {
  private w: World;
  /** The level's moving scenery, and what it reads every frame. */
  private scen: Scenery;
  private live: Live;
  private av: Avatar[];
  private st: Seat[];
  private fx: Fx3;
  private cam: CamRig;
  private au = new Synth();
  private t = 0;
  /** Seconds of play (the cap counts these, not the card's). */
  private playT = 0;
  private phase: "pick" | "play" | "blast" | "done" = "pick";
  /** The round (0…2), its holder (−1: none), the hidden fuse and how far it has burnt. */
  private round = 0;
  private holder = -1;
  private fuse = 8;
  private fuseT = 0;
  /** The next tick, the time since the last (the wallet's pulse). */
  private tickIn = 0.3;
  private tickK = 1;
  private tickN = 0;
  /** Seats in the order they were blasted. */
  private outs: number[] = [];
  private over: number[] | null = null;
  private bt = 0;
  private flyer = -1;
  private flash = 0;
  private human: number;
  // the roulette: the seats it lights in turn, when each hop starts, the one it lands on
  private pickSeq: number[] = [];
  private pickAt: number[] = [];
  private pickT = 0;
  private pickHop = -1;
  private next = 0;
  private dropT = -1;
  // the pass: the wallet's arc from the last head to the new one
  private passT = 1;
  private passFrom = new THREE.Vector3();
  // the 3D bits that move
  private wallet = new THREE.Group();
  private wBody = new THREE.Group();
  private wMat: THREE.MeshToonMaterial;
  private haloMat: THREE.MeshBasicMaterial;
  private halo: THREE.Mesh;
  private spark: THREE.Mesh;
  /** The wallet's glow on the roof under the holder. */
  private pool: THREE.Mesh;
  private poolMat: THREE.MeshBasicMaterial;
  /** The blast: cartoon puffs (yellow core, red rim, inked), each its offset, size and delay. */
  private puffs: THREE.Mesh[] = [];
  private puffD = new Float32Array(PUFFS.length * 5);
  private puffAt = new THREE.Vector3();
  private shockRing: THREE.Mesh;
  private shockRingMat: THREE.MeshBasicMaterial;
  private shockT = 9;
  private star: THREE.Mesh;
  private starMat: THREE.MeshBasicMaterial;
  private starT = 9;
  private dashes: THREE.InstancedMesh;
  private aim: THREE.Mesh;
  /** Late in the fuse: a pulsing red ring round the holder (keep out, it's about to go). */
  private danger: THREE.Mesh;
  private dangerMat: THREE.MeshBasicMaterial;
  private aimMat: THREE.MeshBasicMaterial;
  private beam: THREE.Mesh;
  private beamMat: THREE.MeshBasicMaterial;
  /** The level's props and, on SKYBRIDGE, the chasm's closed stretches (what the AI's rays see). */
  private solid: Box[];
  /** The props as the players bump into them: a stall against the kerb reaches past it (no squeezing through its back). */
  private props: Box[];
  /** SKYBRIDGE: the chasm's closed stretches, as walls (round at the bridges' mouths). */
  private gapWalls: Box2[] = [];
  /** SKYBRIDGE: each bridge open to walk on; the lift in progress (the bridge, the time into it), the next. */
  private bOpen: boolean[] = [];
  private liftB = -1;
  private liftT = 0;
  private liftIn = 0;
  private liftNext = 0;
  /** Steering toward a spring pad on purpose (otherwise the pads are props to the AI's rays). */
  private padHint = false;
  /** HAWKER NIGHT: the turntable's way (±1), its turn now (rad/s), the next flip, the time since the last. */
  private beltDir = 1;
  private beltW = 0;
  private flipIn = 0;
  private sinceFlip = 9;
  /** For the bench (bomb sims): the level's events. */
  stats = { hops: 0, flips: 0, lifts: 0, tossed: 0 };
  // the HUD's: banners, popups
  private banners: { s: string; c: string; t0: number; dur: number; size: number; y: number }[] = [];
  private pops: { x: number; y: number; z: number; s: string; c: string; t0: number; size: number }[] = [];
  private alertOn = false;
  // scratch
  private v1 = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private eye = new THREE.Vector3();
  private at = new THREE.Vector3();
  private m4 = new THREE.Matrix4();
  private q4 = new THREE.Quaternion();
  private s4 = new THREE.Vector3();
  private sx = 0;
  private sz = 0;
  /** route()'s answer: the next waypoint, and where the way comes out on the far roof. */
  private wx = 0;
  private wz = 0;
  private lx = 0;
  private lz = 0;
  /** fit()'s answer: a point kept on the floor. */
  private qx = 0;
  private qz = 0;

  constructor(
    private players: Player[],
    private rnd: Rnd,
    private lv: Level,
  ) {
    this.w = world({ sky: lv.sky, fog: lv.fog, fov: 38, post: lv.look });
    const s = this.w.scene;
    this.human = players.findIndex((p) => p.human);
    this.fx = new Fx3(s, 1100);
    const nb = lv.gap?.bridges.length ?? 0;
    this.live = { t: 0, belt: 0, beltWarn: 0, lift: new Float32Array(nb), warn: new Uint8Array(nb), pad: new Float32Array((lv.gap?.pads.length ?? 0) * 2) };
    this.scen = lv.build({ scene: s, w: this.w, rnd, fx: this.fx });
    this.solid = lv.obst.slice();
    this.props = lv.obst.map((o) => {
      const R = lv.disc;
      if (!R || o.r) return o;
      const q = { ...o };
      if (Math.abs(o.x) >= Math.abs(o.z) && Math.abs(o.x) + o.hx > R - 2 * PR) {
        const sd = Math.sign(o.x);
        const inner = o.x - sd * o.hx;
        q.x = (inner + sd * (R + 1)) / 2;
        q.hx = Math.abs(sd * (R + 1) - inner) / 2;
      } else if (Math.abs(o.z) > Math.abs(o.x) && Math.abs(o.z) + o.hz > R - 2 * PR) {
        const sd = Math.sign(o.z);
        const inner = o.z - sd * o.hz;
        q.z = (inner + sd * (R + 1)) / 2;
        q.hz = Math.abs(sd * (R + 1) - inner) / 2;
      }
      return q;
    });
    if (lv.gap) {
      this.bOpen = lv.gap.bridges.map(() => true);
      this.liftIn = lv.gap.first;
      this.liftNext = Math.floor(rnd() * nb) % nb;
      this.buildGapBoxes();
    }
    if (lv.belt) {
      this.beltDir = rnd() < 0.5 ? 1 : -1;
      this.beltW = this.beltDir * lv.belt.w;
      this.flipIn = lv.belt.first;
    }

    this.av = players.map((p, i) => {
      const a = new Avatar(s, p);
      const [x, z] = lv.starts[i];
      a.pos.set(x, 0, z);
      a.yaw = yawOf(-a.pos.x, -a.pos.z);
      a.sync(0);
      return a;
    });
    this.st = this.av.map((a) => ({
      a,
      vx: 0,
      vz: 0,
      dash: 0,
      cd: 0,
      dashX: 0,
      dashZ: 0,
      immune: 0,
      stun: 0,
      hurt: 0,
      out: false,
      fly: -1,
      fvx: 0,
      fvz: 0,
      gone: false,
      think: 0,
      gx: 0,
      gz: 0,
      gk: 0,
      target: -1,
      panic: 0,
      want: false,
      wantX: 0,
      wantZ: 0,
      ox: 0,
      oz: 0,
      buf: 0,
      side: a.pos.x < 0 ? -1 : 1,
      hop: 0,
      cx: 0,
      cz: 0,
    }));

    // the HOT WALLET
    this.wMat = new THREE.MeshToonMaterial({ color: C_COOL.clone(), emissive: E_COOL.clone(), gradientMap: toonSteps() });
    this.haloMat = new THREE.MeshBasicMaterial({ color: L_COOL.clone(), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false });
    this.halo = new THREE.Mesh(GEO.ball, this.haloMat);
    this.spark = new THREE.Mesh(GEO.ball, glow("#fff1a8", 1, true));
    this.poolMat = new THREE.MeshBasicMaterial({ map: poolTex(), color: L_COOL.clone(), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false });
    this.pool = new THREE.Mesh(GEO.plane, this.poolMat);
    this.pool.rotation.x = -Math.PI / 2;
    this.pool.renderOrder = 3;
    this.pool.visible = false;
    this.buildWallet();

    // the blast's shock sphere and floor ring, the twinkle, the threat line, the roulette's beam
    const ink = new THREE.MeshBasicMaterial({ color: 0x15101f, side: THREE.BackSide });
    for (const c of PUFFS) {
      const m = new THREE.Mesh(GEO.ball, glow(c));
      const o = new THREE.Mesh(GEO.ball, ink);
      o.scale.setScalar(1.12);
      m.add(o);
      m.visible = false;
      s.add(m);
      this.puffs.push(m);
    }
    this.shockRingMat = new THREE.MeshBasicMaterial({ color: "#ff7a2e", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.shockRing = new THREE.Mesh(GEO.ring, this.shockRingMat);
    this.shockRing.rotation.x = -Math.PI / 2;
    this.shockRing.visible = false;
    this.starMat = new THREE.MeshBasicMaterial({ map: starTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
    this.star = new THREE.Mesh(GEO.plane, this.starMat);
    this.star.visible = false;
    this.star.renderOrder = 10;
    this.dashes = new THREE.InstancedMesh(GEO.box, glow("#ff3b2f", 0.8), 18);
    this.dashes.count = 0;
    this.dashes.frustumCulled = false;
    this.aimMat = new THREE.MeshBasicMaterial({ color: "#ff3b2f", transparent: true, opacity: 0.8, depthWrite: false });
    this.aim = new THREE.Mesh(GEO.ring, this.aimMat);
    this.aim.rotation.x = -Math.PI / 2;
    this.aim.renderOrder = 4;
    this.aim.visible = false;
    this.dangerMat = new THREE.MeshBasicMaterial({ color: "#ff2a1a", transparent: true, opacity: 0, depthWrite: false });
    this.danger = new THREE.Mesh(new THREE.RingGeometry(0.44, 0.5, 48), this.dangerMat);
    this.danger.rotation.x = -Math.PI / 2;
    this.danger.renderOrder = 4;
    this.danger.visible = false;
    s.add(this.danger);
    this.beamMat = new THREE.MeshBasicMaterial({ color: "#fff2b0", transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.1, 9, 20, 1, true), this.beamMat);
    this.beam.visible = false;
    s.add(this.shockRing, this.star, this.dashes, this.aim, this.beam);

    this.cam = new CamRig(this.w.camera);
    this.playCam(this.eye, this.at);
    this.cam.set(this.eye, this.at);
    this.cam.apply(0);
    // the first wallet: who gets it is drawn now, shown by the roulette during the 3-2-1
    this.beginPick();
  }

  // ---- building --------------------------------------------------------------------------------

  private buildWallet() {
    const g = this.wallet;
    const b = this.wBody;
    g.add(b);
    outline(block("", 0.9, 0.62, 0.38, 0, 0, 0, b, this.wMat), 0.035);
    const flapMat = new THREE.MeshToonMaterial({ color: "#c2401b", gradientMap: toonSteps() });
    outline(block("", 0.94, 0.3, 0.1, 0, 0.13, 0.17, b, flapMat), 0.03);
    block("", 0.24, 0.22, 0.07, 0, 0.0, 0.24, b, new THREE.MeshToonMaterial({ map: qTex(), gradientMap: toonSteps(), emissive: 0x2a1c00 }));
    const bill1 = block("#5fd35f", 0.62, 0.2, 0.05, -0.08, 0.36, 0.02, b);
    bill1.rotation.z = 0.12;
    const bill2 = block("#8ae88a", 0.55, 0.2, 0.05, 0.04, 0.38, -0.08, b);
    bill2.rotation.z = -0.1;
    block("#3b3550", 0.16, 0.1, 0.16, 0.3, 0.35, 0, b);
    const f1 = block("#2a2438", 0.06, 0.22, 0.06, 0.33, 0.5, 0, b);
    f1.rotation.z = -0.3;
    const f2 = block("#2a2438", 0.06, 0.16, 0.06, 0.41, 0.63, 0, b);
    f2.rotation.z = -0.95;
    this.spark.position.set(0.48, 0.68, 0);
    b.add(this.spark);
    this.halo.scale.setScalar(1.3);
    g.add(this.halo);
    this.wallet.visible = false;
    this.w.scene.add(g, this.pool);
  }

  // ---- the rounds ------------------------------------------------------------------------------

  private aliveN() {
    let n = 0;
    for (let i = 0; i < 4; i++) if (!this.st[i].out) n++;
    return n;
  }

  private alive() {
    const r: number[] = [];
    for (let i = 0; i < 4; i++) if (!this.st[i].out) r.push(i);
    return r;
  }

  /** The roulette: a seeded survivor gets the next wallet; the lights hop round to them. */
  private beginPick() {
    const alive = this.alive();
    const n = alive.length;
    this.next = alive[Math.floor(this.rnd() * n)];
    const hops = n >= 3 ? 9 : 8;
    const ci = alive.indexOf(this.next);
    this.pickSeq.length = 0;
    this.pickAt.length = 0;
    let at = 0;
    for (let h = 0; h < hops; h++) {
      this.pickSeq.push(alive[(((ci - (hops - 1 - h)) % n) + n) % n]);
      this.pickAt.push(at);
      at += HOP0 + HOP_K * h;
    }
    this.pickAt.push(at);
    this.pickT = 0;
    this.pickHop = -1;
    this.dropT = -1;
    this.phase = "pick";
  }

  private stepPick(dt: number) {
    this.pickT += dt;
    const nh = this.pickSeq.length;
    if (this.pickT < this.pickAt[nh]) {
      let h = 0;
      while (h < nh - 1 && this.pickT >= this.pickAt[h + 1]) h++;
      if (h !== this.pickHop) {
        this.pickHop = h;
        sfx.roll();
        // (a little ring of sparks under whoever the light is on)
        const lp = this.av[this.pickSeq[h]].pos;
        this.fx.burst(this.v1.set(lp.x, 0.1, lp.z), 6, ["#fff2b0", "#ffd23f", this.players[this.pickSeq[h]].color], { speed: 2.5, up: 1.5, size: 0.1, life: 0.35 });
      }
      return;
    }
    if (this.dropT < 0) {
      this.dropT = 0;
      this.pickHop = nh - 1;
      this.au.tone(1400, DROP, "triangle", 0.18, 0.4);
    }
    this.dropT += dt;
    if (this.dropT >= DROP) this.startRound();
  }

  private startRound() {
    this.holder = this.next;
    this.phase = "play";
    this.fuse = FUSE_MIN + this.rnd() * FUSE_RANGE;
    this.fuseT = 0;
    this.tickIn = 0.25;
    this.passT = 1;
    this.dropT = -1;
    this.pickHop = -1;
    const s = this.st[this.holder];
    s.stun = START_STUN;
    s.hurt = 0.5;
    s.a.hit();
    s.a.jump(6);
    this.v1.copy(s.a.pos).setY(HOLD_Y);
    this.fx.burst(this.v1, 26, [...FIRE.slice(0, 3), this.players[this.holder].color], { speed: 5, up: 4, size: 0.16, life: 0.7 });
    this.cam.shake(0.25);
    this.au.tone(520, 0.12, "square", 0.3, 2.2);
    this.au.noise(0.12, 0.3, 0, "lowpass", 1200);
    this.pop(s.a.pos, T("HOT!", "烫！"), "#ff6b35");
  }

  private explode() {
    const i = this.holder;
    const s = this.st[i];
    const a = s.a;
    const at = this.v1.copy(this.wallet.position);
    this.fx.burst(at, 80, FIRE, { speed: 13, up: 5, gravity: 7, size: 0.32, life: 0.85, drag: 2.4 });
    this.fx.burst(at, 18, SMOKE, { speed: 5, up: 2.5, gravity: -1.5, size: 0.45, life: 1.2, drag: 2.4 });
    this.fx.burst(at, 34, CASH, { speed: 8, up: 10, gravity: 13, size: 0.24, life: 2.0, drag: 0.7 });
    this.shockT = 0;
    this.puffAt.copy(at);
    // (the rim's puffs round the core in the screen's plane, a little behind it: the yellow stays in front)
    const e = this.w.camera.matrixWorld.elements;
    for (let k = 0; k < PUFFS.length; k++) {
      const core = k < 3;
      const ang = (k / PUFFS.length) * Math.PI * 2 * 3.3 + this.rnd();
      const d = core ? 0.25 * k : 1.0 + (k % 3) * 0.35;
      const ox = Math.cos(ang) * d,
        oy = Math.sin(ang) * d * 0.8 + 0.2;
      const back = core ? 0 : 0.9;
      this.puffD[k * 5] = e[0] * ox + e[4] * oy - e[8] * back;
      this.puffD[k * 5 + 1] = e[1] * ox + e[5] * oy - e[9] * back;
      this.puffD[k * 5 + 2] = e[2] * ox + e[6] * oy - e[10] * back;
      this.puffD[k * 5 + 3] = core ? 1.9 - k * 0.25 : 0.8 + (k % 4) * 0.18;
      this.puffD[k * 5 + 4] = core ? 0 : 0.03 + (k % 5) * 0.025;
    }
    this.shockRing.position.set(a.pos.x, 0.06, a.pos.z);
    this.cam.shake(1.2);
    this.flash = 1;
    this.au.noise(1.2, 0.9, 0, "lowpass", 900);
    this.au.noise(0.35, 0.4, 0, "highpass", 2500);
    this.au.tone(140, 0.8, "sine", 0.9, 0.25);
    this.au.tone(70, 1.0, "triangle", 0.5, 0.5);
    this.au.tone(1100, 1.3, "triangle", 0.2, 0.3, 0);
    sfx.thud();
    // the holder: sky-high, spinning, off the roof
    s.out = true;
    a.out = true;
    this.outs.push(i);
    s.fly = 0;
    s.hurt = 3;
    this.flyer = i;
    const side = a.pos.x >= 0 ? 1 : -1;
    s.fvx = side * 1.4 + a.pos.x * 0.2;
    s.fvz = -3.6 - this.rnd() * 0.8;
    a.vy = 13.5;
    a.grounded = false;
    a.floor = null;
    a.body.holdArms(true);
    a.body.root.position.y = -0.8;
    // everyone near is knocked back
    for (const j of this.alive()) {
      const o = this.st[j];
      const dx = o.a.pos.x - a.pos.x,
        dz = o.a.pos.z - a.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d < 3.8) {
        const k = 4 + 7 * (1 - d / 3.8);
        o.vx += (dx / d) * k;
        o.vz += (dz / d) * k;
        o.stun = Math.max(o.stun, 0.3);
        o.hurt = 0.6;
        o.a.jump(5);
        o.a.hit();
      }
    }
    this.holder = -1;
    this.phase = "blast";
    this.bt = 0;
    const p = this.players[i];
    const left = this.alive().length;
    this.say(p.human ? T("YOU'RE OUT!", "你出局了！") : T(`${short(p).toUpperCase()} OUT!`, `${short(p)} 出局！`), "#ff4a3a", 1.9, 64, 0.25, H * 0.74);
    this.pop(at.setY(at.y - 1.6), T("BOOM!", "轰！"), "#ffd23f", 54);
    if (left === 2) this.say(T("FINAL DUEL!", "最终对决！"), "#ffd23f", 1.4, 54, BLAST_T - 0.2);
    else if (left > 2) this.say(T(`${left} LEFT!`, `剩 ${left} 人！`), "#ffffff", 1.3, 54, BLAST_T - 0.2);
  }

  /** A banner across the middle, `delay` seconds from now. */
  private say(s: string, c: string, dur = 1.4, size = 58, delay = 0, y = H * 0.36) {
    this.banners.push({ s, c, t0: this.t + delay, dur, size, y });
  }
  private pop(at: THREE.Vector3, s: string, c: string, size = 26) {
    this.pops.push({ x: at.x, y: at.y + 2.6, z: at.z, s, c, t0: this.t, size });
  }

  // ---- the frame -------------------------------------------------------------------------------

  idle(dt: number, phase: "card" | "count", k: number) {
    this.t += dt;
    if (phase === "card") {
      // a slow circle round the roof; the wallet spins over the Q pad
      this.cam.orbit(this.v1.set(0, 0.8, -0.5), 0.55 - k * 0.16, this.lv.cam.orbit[0], this.lv.cam.orbit[1]);
      this.wallet.visible = true;
      this.wallet.position.set(0, (this.lv.cam.wy ?? 2.4) + Math.sin(this.t * 2.5) * 0.15, 0);
      this.wallet.rotation.y = this.t * 1.6;
      this.wBody.scale.setScalar(1.7);
      for (const a of this.av) a.face(yawOf(-a.pos.x, -a.pos.z), dt, 4);
    } else {
      this.playCam(this.eye, this.at);
      this.cam.to(this.eye, this.at, dt, 3.2);
      if (this.phase === "pick") this.stepPick(dt);
    }
    this.cam.apply(dt);
    if (phase !== "card") this.thumbsView();
    if (phase !== "card") this.wallet3(dt);
    this.twist(dt, false);
    this.decor(dt);
    for (let i = 0; i < 4; i++) this.pose(i, dt);
    this.fx.update(dt);
  }

  update(dt: number, input: Input) {
    this.t += dt;
    this.playT += dt;
    // (the 3-2-1 ended before the roulette did: the wallet lands now)
    if (this.phase === "pick" && this.round === 0) this.startRound();
    if (this.phase === "pick") this.stepPick(dt);
    else if (this.phase === "play") {
      this.fuseT += dt;
      this.tickIn -= dt;
      const k = this.heat();
      if (this.tickIn <= 0) {
        this.tickN++;
        this.tickK = 0;
        this.tickIn = lerp(0.62, 0.075, Math.pow(k, 1.15));
        this.au.tone(this.tickN % 2 ? 1500 : 1120, 0.035, "square", 0.12 + 0.18 * k);
      }
      if (this.fuseT >= this.fuse) this.explode();
    } else if (this.phase === "blast") {
      this.bt += dt;
      const left = this.aliveN();
      if (this.bt > 0.75 && this.bt - dt <= 0.75) for (let j = 0; j < 4; j++) if (!this.st[j].out) this.av[j].cheer(left === 1 ? 4 : 1.3);
      if (left === 1) {
        if (this.bt >= END_AT) {
          this.over = [...this.alive(), ...this.outs.slice().reverse()];
          this.phase = "done";
          // confetti over the last one standing
          const wp = this.av[this.over[0]].pos;
          this.fx.burst(this.v1.set(wp.x, 3.2, wp.z), 60, ["#ffd23f", "#ff5fc8", "#5ff2ff", "#a0ff6a", "#ffffff", this.players[this.over[0]].color], { speed: 7, up: 6, gravity: 6, size: 0.14, life: 1.6, drag: 1.2 });
          this.cam.shake(0.2);
          sfx.coin();
        }
      } else if (this.bt >= BLAST_T) {
        this.round++;
        this.beginPick();
      }
    } else if (this.phase === "done") this.bt += dt;
    // the cap (never reached: the fuses end it first)
    if (!this.over && this.playT > CAP) {
      // (the one holding it ranks last of those still in)
      const left = this.alive().sort((x, y) => (x === this.holder ? 1 : 0) - (y === this.holder ? 1 : 0));
      this.over = [...left, ...this.outs.slice().reverse()];
      this.phase = "done";
    }
    const playing = this.phase === "play" || this.phase === "pick";
    this.twist(dt, !this.over);
    for (let i = 0; i < 4; i++) this.move(i, dt, input, playing || this.phase === "blast");
    // the relieved (and the winner) cheer to the camera
    if ((this.phase === "blast" && this.bt > 0.75 && this.bt < 2.1) || this.phase === "done")
      for (let i = 0; i < 4; i++) {
        const a = this.av[i];
        if (!this.st[i].out && (this.phase === "done" || !this.players[i].human)) a.face(yawOf(this.cam.eye.x - a.pos.x, this.cam.eye.z - a.pos.z), dt, 7);
      }
    this.collide();
    if (this.phase === "play") this.passCheck();
    for (let i = 0; i < 4; i++) this.pose(i, dt);
    this.wallet3(dt);
    this.threat();
    this.decor(dt);
    // the song tenses as the fuse burns (and more in the final duel); the blast and the roulette breathe
    music.rate(this.phase === "play" ? 1 + 0.38 * Math.pow(this.heat(), 1.4) + (this.aliveN() === 2 ? 0.06 : 0) : 1);
    this.fx.update(dt);
    this.flash = Math.max(0, this.flash - dt * 3.2);
    // the camera: over the roof, leaning toward the holder and you; after a blast, up after the flyer
    this.playCam(this.eye, this.at);
    const f = this.flyer >= 0 ? this.st[this.flyer] : null;
    if (f && f.fly > 0.1 && f.fly < 2.2) {
      const u = clamp((f.fly - 0.1) / 0.3, 0, 1) * clamp((2.2 - f.fly) / 0.5, 0, 1);
      this.at.lerp(this.v2.copy(f.a.pos).setY(Math.min(f.a.pos.y, 10)), 0.6 * u);
      this.eye.y += 1.5 * u;
      this.eye.z += 3.5 * u;
      this.cam.to(this.eye, this.at, dt, 3, 6);
    } else if (this.phase === "done" && this.over) {
      // the winner, cheering, under the host's FINISH
      const wa = this.av[this.over[0]].pos;
      this.at.set(wa.x, wa.y + 3.1, wa.z);
      this.eye.set(wa.x * 0.7, 6.6, wa.z + 8.6);
      this.cam.to(this.eye, this.at, dt, 2.4);
    } else this.cam.to(this.eye, this.at, dt, 2.6);
    this.cam.apply(dt);
    this.thumbsView();
  }

  /**
   * A touch screen: the picture alone backs off a little (the drawn camera, never the rig the steering
   * reads: the sim is the same on every screen), by how far the stick reaches into the frame, so the
   * floor's front corners come out from under the thumbs.
   */
  private thumbsView() {
    if (!HUD.thumbs || this.phase === "done") return;
    const k = 0.14 * clamp(HUD.free[0] / 225, 0, 1);
    if (k < 0.01) return;
    const c = this.w.camera;
    c.translateZ(this.cam.eye.distanceTo(this.cam.at) * k);
    c.updateMatrixWorld();
  }

  /** How far the fuse has burnt (0…1): what the wallet's tells show. */
  private heat() {
    return this.phase === "play" ? clamp(this.fuseT / this.fuse, 0, 1) : 0;
  }

  private playCam(eye: THREE.Vector3, at: THREE.Vector3) {
    let fx = 0,
      fz = 0,
      ws = 1;
    const h = this.holder >= 0 ? this.holder : this.pickHop >= 0 ? this.pickSeq[this.pickHop] : -1;
    if (h >= 0 && !this.st[h].out) {
      fx += this.av[h].pos.x * 0.4;
      fz += this.av[h].pos.z * 0.4;
      ws += 0.4;
    }
    const me = this.human;
    if (me >= 0 && me !== h && !this.st[me].out) {
      fx += this.av[me].pos.x * 0.3;
      fz += this.av[me].pos.z * 0.3;
      ws += 0.3;
    }
    const c = this.lv.cam;
    fx = clamp(fx / ws, -c.px, c.px);
    fz = clamp(fz / ws, -c.pz, c.pz);
    at.set(fx, 0, fz - 0.3);
    eye.set(fx * 0.8, c.y, fz + c.z);
  }

  // ---- the level's twist ------------------------------------------------------------------------

  /** The turntable's flips and the drawbridges' lifts (`run`: their clocks run; in the card the belt just turns). */
  private twist(dt: number, run: boolean) {
    const L = this.live;
    L.t = this.t;
    for (let k = 0; k < L.pad.length; k++) L.pad[k] = Math.max(0, L.pad[k] - dt * 3.5);
    const b = this.lv.belt;
    if (b) {
      if (run) {
        const was = this.flipIn;
        this.flipIn -= dt;
        this.sinceFlip += dt;
        if (was > b.warn && this.flipIn <= b.warn) {
          // the warning: the arrows blink amber, a buzzer, the word
          this.say(T("REVERSE!", "反转！"), "#ffb52e", 1.3, 40, 0, H * 0.2);
          this.au.tone(330, 0.16, "sawtooth", 0.16, 1.3);
        }
        if (this.flipIn < b.warn && Math.floor(was * 3) !== Math.floor(this.flipIn * 3) && this.flipIn > 0) this.au.tone(this.flipIn < FLIP_STOP ? 880 : 660, 0.06, "square", 0.1);
        if (this.flipIn <= 0) {
          this.beltDir = -this.beltDir;
          this.sinceFlip = 0;
          this.flipIn = b.every[0] + this.rnd() * b.every[1];
          this.stats.flips++;
          this.au.tone(220, 0.25, "sawtooth", 0.18, 2.2);
          this.cam.shake(0.18);
          // (sparks off the ring as it changes its mind)
          const rm = (b.r0 + b.r1) / 2;
          for (let n = 0; n < 8; n++) this.fx.burst(this.v1.set(Math.sin(n * 0.785) * rm, 0.2, Math.cos(n * 0.785) * rm), 3, ["#ffb52e", "#ffffff", "#5ff2ff"], { speed: 3, up: 2.5, size: 0.12, life: 0.45 });
        }
      }
      const stop = clamp(this.flipIn / FLIP_STOP, 0, 1);
      const go = clamp(this.sinceFlip / FLIP_GO, 0, 1);
      this.beltW = this.beltDir * b.w * Math.min(stop, go);
      L.belt = this.beltW;
      L.beltWarn = run && this.flipIn < b.warn ? (Math.floor(this.t * 6) % 2 ? 1 : 0.3) : 0;
    }
    const g = this.lv.gap;
    if (!g) return;
    const n = g.bridges.length;
    if (run) {
      if (this.liftB < 0) {
        this.liftIn -= dt;
        if (this.liftIn <= 0) {
          this.liftB = this.liftNext;
          this.liftNext = (this.liftNext + 1) % n;
          this.liftT = 0;
          this.stats.lifts++;
          // the warning: lamps, a horn, the word over the bridge
          const br = g.bridges[this.liftB];
          this.say(T("BRIDGE UP!", "吊桥升起！"), "#ffb52e", 1.2, 40, 0, H * 0.2);
          this.pops.push({ x: 0, y: 0.4, z: br.z, s: T("UP!", "升！"), c: "#ffb52e", t0: this.t, size: 30 });
          this.au.tone(392, 0.32, "sawtooth", 0.16);
          this.au.tone(311, 0.42, "sawtooth", 0.16, 0, (this.au.ctx()?.currentTime ?? 0) + 0.34);
        }
      } else {
        this.liftT += dt;
        if (this.liftT >= g.warn + 2 * SWING + g.up) {
          this.liftB = -1;
          this.liftIn = g.every;
        }
      }
    }
    let changed = false;
    for (let k = 0; k < n; k++) {
      let lift = 0;
      let warn = false;
      if (k === this.liftB) {
        const u = this.liftT - g.warn;
        if (u < 0) warn = true;
        else if (u < SWING) lift = u / SWING;
        else if (u < SWING + g.up) lift = 1;
        else lift = Math.max(0, 1 - (u - SWING - g.up) / SWING);
        if (u > SWING + g.up - 0.6) warn = true;
      }
      L.lift[k] = lift;
      L.warn[k] = warn ? (Math.floor(this.t * 5) % 2 ? 1 : 2) : 0;
      const open = lift < 0.2;
      if (open !== this.bOpen[k]) {
        this.bOpen[k] = open;
        changed = true;
        if (!open) this.toss(k);
        else this.au.tone(523, 0.1, "triangle", 0.14, 1.5);
        // (sparks at the hinges as the leaves leave or meet)
        const bz = g.bridges[k].z;
        for (let sd = -1; sd <= 1; sd += 2) this.fx.burst(this.v1.set(sd * g.g, 0.15, bz), 8, ["#ffd23f", "#ffffff", "#ff9a2e"], { speed: 3, up: 2.5, size: 0.1, life: 0.4 });
      }
    }
    if (changed) this.buildGapBoxes();
  }

  /** The chasm's closed stretches (where no open bridge crosses): props to the AI's rays. */
  private buildGapBoxes() {
    const g = this.lv.gap!;
    const zEnd = (this.lv.rect?.[1] ?? 8) + 1;
    const boxes: Box[] = [];
    let z0 = -zEnd;
    const spans = g.bridges.map((b, k) => ({ b, k })).sort((p, q) => p.b.z - q.b.z);
    for (const { b, k } of spans) {
      if (!this.bOpen[k]) continue;
      if (b.z - b.hz > z0) boxes.push({ x: 0, z: (z0 + b.z - b.hz) / 2, hx: g.g, hz: (b.z - b.hz - z0) / 2 });
      z0 = b.z + b.hz;
    }
    if (zEnd > z0) boxes.push({ x: 0, z: (z0 + zEnd) / 2, hx: g.g, hz: (zEnd - z0) / 2 });
    this.solid = [...this.lv.obst, ...boxes];
    this.gapWalls = boxes.map((b) => ({ x: b.x, z: b.z, hw: b.hx, hd: b.hz }));
  }

  /** A bridge swings up: whoever is on it is tipped off onto the nearer roof. */
  private toss(k: number) {
    const g = this.lv.gap!;
    const br = g.bridges[k];
    this.cam.shake(0.2);
    this.au.noise(0.25, 0.25, 0, "lowpass", 700);
    for (let i = 0; i < 4; i++) {
      const s = this.st[i];
      const p = s.a.pos;
      if (s.out || s.hop > 0 || Math.abs(p.x) >= g.g + PR * 0.5 || Math.abs(p.z - br.z) >= br.hz + PR) continue;
      const sd = p.x < 0 ? -1 : 1;
      p.x = sd * (g.g + PR + 0.05);
      s.side = sd;
      s.vx = sd * 4;
      s.dash = 0;
      s.stun = Math.max(s.stun, 0.35);
      s.hurt = 0.5;
      s.a.jump(6);
      s.a.hit();
      this.stats.tossed++;
      this.fx.burst(this.v1.set(p.x, 0.4, p.z), 14, ["#ffb52e", "#ffffff", this.players[i].color], { speed: 4, up: 3, size: 0.14, life: 0.5 });
      this.pop(p, T("WHOA!", "哇！"), "#ffb52e", 22);
    }
  }

  /** A spring pad: up and over the chasm, to the far roof. */
  private spring(i: number, k: number, sd: number) {
    const g = this.lv.gap!;
    const s = this.st[i];
    const a = s.a;
    const lx = -sd * g.landX,
      lz = g.pads[k];
    s.hop = HOP_T;
    s.dash = 0;
    s.vx = (lx - a.pos.x) / HOP_T;
    s.vz = (lz - a.pos.z) / HOP_T;
    a.jump(1);
    a.vy = (30 * HOP_T) / 2;
    this.live.pad[k * 2 + (sd > 0 ? 1 : 0)] = 1;
    this.stats.hops++;
    this.fx.burst(this.v1.set(a.pos.x, 0.3, a.pos.z), 16, ["#ffffff", "#ff4f6d", "#ffd23f", this.players[i].color], { speed: 4, up: 5, size: 0.15, life: 0.55 });
    this.au.tone(180, 0.28, "sine", 0.3, 4.5);
    this.au.tone(360, 0.2, "triangle", 0.12, 3);
    if (this.players[i].human) this.pop(a.pos, T("BOING!", "弹！"), "#ff4f6d", 24);
  }

  // ---- moving ----------------------------------------------------------------------------------

  private move(i: number, dt: number, input: Input, free: boolean) {
    const s = this.st[i];
    const a = s.a;
    const p = this.players[i];
    s.cd = Math.max(0, s.cd - dt);
    s.immune = Math.max(0, s.immune - dt);
    s.stun = Math.max(0, s.stun - dt);
    s.hurt = Math.max(0, s.hurt - dt);
    s.ox = a.pos.x;
    s.oz = a.pos.z;
    if (s.out) {
      this.flight(i, dt);
      return;
    }
    if (s.hop > 0) {
      // over the chasm: no steering mid-air
      s.hop -= dt;
      a.pos.x += s.vx * dt;
      a.pos.z += s.vz * dt;
      a.face(yawOf(s.vx, s.vz), dt, 20);
      a.physics(dt, 0);
      if (a.grounded && s.hop < HOP_T * 0.5) {
        s.hop = 0;
        s.side = a.pos.x < 0 ? -1 : 1;
        s.vx *= 0.35;
        s.vz *= 0.35;
        this.fx.burst(this.v1.set(a.pos.x, 0.1, a.pos.z), 10, ["#ffffff", "#e6eefc"], { speed: 3, up: 1.2, size: 0.16, life: 0.45 });
        this.au.noise(0.1, 0.18, 0, "lowpass", 900);
      }
      return;
    }
    let mx = 0,
      mz = 0,
      dash = false;
    if (free && !this.over) {
      if (p.human) {
        const ax = input.axis();
        // screen-relative: "up" is away from the camera
        let fx = this.cam.at.x - this.cam.eye.x,
          fz = this.cam.at.z - this.cam.eye.z;
        const fl = Math.hypot(fx, fz) || 1;
        fx /= fl;
        fz /= fl;
        mx = -fz * ax.x - fx * ax.y;
        mz = fx * ax.x - fz * ax.y;
        const l = Math.hypot(mx, mz);
        if (l > 1) ((mx /= l), (mz /= l));
        // (a press a moment early still counts: at the end of a stun, of the cooldown)
        if (input.pressed("a")) s.buf = 0.18;
        dash = s.buf > 0;
      } else if (!(this.phase === "blast" && this.bt > 0.6 && this.bt < 2.1)) {
        this.ai(i, dt);
        mx = s.gx * s.gk;
        mz = s.gz * s.gk;
        dash = s.want;
        s.want = false;
      }
    }
    s.buf = Math.max(0, s.buf - dt);
    if (s.stun > 0) ((mx = 0), (mz = 0), (dash = false));
    const sk = p.human ? 1 : 0.82 + 0.18 * p.skill;
    const sp = SPEED * (i === this.holder ? HOLD_BOOST : 1) * sk * (1 + this.round * 0.04);
    if (dash && s.cd <= 0) {
      let dx = mx,
        dz = mz;
      if (!p.human && (s.wantX || s.wantZ)) ((dx = s.wantX), (dz = s.wantZ));
      let l = Math.hypot(dx, dz);
      if (l < 0.1) ((dx = Math.sin(a.yaw)), (dz = Math.cos(a.yaw)), (l = 1));
      s.dashX = dx / l;
      s.dashZ = dz / l;
      s.dash = DASH_T;
      s.cd = DASH_CD;
      s.buf = 0;
      this.fx.burst(this.v1.set(a.pos.x, 0.15, a.pos.z), 10, ["#ffffff", "#dfe8ff", p.color], { speed: 3, up: 1.5, size: 0.14, life: 0.45 });
      if (p.human) this.au.noise(0.22, 0.3, 0, "bandpass", 2200);
      else this.au.noise(0.16, 0.1, 0, "bandpass", 2000);
    }
    if (s.dash > 0) {
      s.dash -= dt;
      s.vx = s.dashX * DASH_V;
      s.vz = s.dashZ * DASH_V;
      if (Math.random() < 0.6) this.fx.burst(this.v1.set(a.pos.x, 0.2, a.pos.z), 1, ["#ffffff", p.color], { speed: 1, up: 1, size: 0.12, life: 0.35 });
    } else {
      const e = 1 - Math.exp(-(s.stun > 0 ? 4 : 13) * dt);
      s.vx += (mx * sp - s.vx) * e;
      s.vz += (mz * sp - s.vz) * e;
    }
    a.pos.x += s.vx * dt;
    a.pos.z += s.vz * dt;
    // the turntable carries whoever stands on it
    s.cx = s.cz = 0;
    const b = this.lv.belt;
    if (b && a.pos.y < 0.3) {
      const r = Math.hypot(a.pos.x, a.pos.z);
      if (r > b.r0 && r < b.r1) {
        s.cx = this.beltW * a.pos.z;
        s.cz = -this.beltW * a.pos.x;
        a.pos.x += s.cx * dt;
        a.pos.z += s.cz * dt;
      }
    }
    const v = Math.hypot(s.vx, s.vz);
    if (v > 0.6 && s.stun <= 0) a.face(yawOf(s.vx, s.vz), dt, s.dash > 0 ? 30 : 14);
    a.physics(dt, 0);
    // a spring pad underfoot: over you go
    const g = this.lv.gap;
    if (g && a.grounded)
      for (let k = 0; k < g.pads.length; k++)
        for (let sd = -1; sd <= 1; sd += 2)
          if (Math.hypot(a.pos.x - sd * g.padX, a.pos.z - g.pads[k]) < g.padR * 0.8) {
            this.spring(i, k, sd);
            return;
          }
  }

  /** Blasted: up, away from the camera, spinning; then a twinkle and gone. */
  private flight(i: number, dt: number) {
    const s = this.st[i];
    const a = s.a;
    if (s.fly < 0) return;
    s.fly += dt;
    if (s.gone) return;
    a.pos.x += s.fvx * dt;
    a.pos.z += s.fvz * dt;
    a.physics(dt, null, 9);
    a.yaw += dt * 11;
    if (Math.random() < 0.5) this.fx.burst(this.v1.copy(a.pos), 1, SMOKE, { speed: 0.5, up: 0.3, gravity: -0.5, size: 0.26, life: 0.6 });
    if (s.fly > 1.45) {
      s.gone = true;
      a.root.visible = false;
      this.starT = 0;
      this.star.position.copy(a.pos);
      this.au.tone(2349, 0.16, "triangle", 0.25);
      this.au.tone(3136, 0.35, "triangle", 0.22, 0, (this.au.ctx()?.currentTime ?? 0) + 0.08);
    }
  }

  /** Players don't overlap; the edge, the props and the chasm hold them. */
  private collide() {
    const st = this.st;
    const lv = this.lv;
    // (a few rounds: one pinned against a wall is not walked into, and a nook between a prop and the
    // kerb holds; the floor's edge last, so nobody is ever left past it)
    for (let n = 0; n < 3; n++) {
      for (let i = 0; i < 4; i++) {
        if (st[i].out || st[i].hop > 0) continue;
        for (let j = i + 1; j < 4; j++) if (!st[j].out && st[j].hop <= 0) pushApart(st[i].a.pos, st[j].a.pos, PR, PR);
      }
      for (let i = 0; i < 4; i++) {
        const s = st[i];
        if (s.out || s.hop > 0) continue;
        const p = s.a.pos;
        for (const o of this.props) {
          if (o.r) {
            const dx = p.x - o.x,
              dz = p.z - o.z;
            const d = Math.hypot(dx, dz);
            const m = o.r + PR;
            if (d < m) {
              if (d > 1e-4) ((p.x = o.x + (dx / d) * m), (p.z = o.z + (dz / d) * m));
              else p.z = o.z + m;
            }
            continue;
          }
          const cx = clamp(p.x, o.x - o.hx, o.x + o.hx),
            cz = clamp(p.z, o.z - o.hz, o.z + o.hz);
          const dx = p.x - cx,
            dz = p.z - cz;
          const d = Math.hypot(dx, dz);
          if (d < PR) {
            if (d > 1e-4) {
              p.x = cx + (dx / d) * PR;
              p.z = cz + (dz / d) * PR;
            } else {
              // (inside, a dash on a slow frame: back out by the side it came in, never out the far
              // one, behind a stall; failing that by the nearest side)
              const qx = clamp(s.ox, o.x - o.hx, o.x + o.hx),
                qz = clamp(s.oz, o.z - o.hz, o.z + o.hz);
              const bx = s.ox - qx,
                bz = s.oz - qz;
              const bl = Math.hypot(bx, bz);
              const ex = o.hx - Math.abs(p.x - o.x),
                ez = o.hz - Math.abs(p.z - o.z);
              if (bl > 1e-4) ((p.x = qx + (bx / bl) * PR), (p.z = qz + (bz / bl) * PR));
              else if (ex < ez) p.x = o.x + Math.sign(p.x - o.x || 1) * (o.hx + PR);
              else p.z = o.z + Math.sign(p.z - o.z || 1) * (o.hz + PR);
            }
          }
        }
        if (lv.gap) this.chasm(s);
        if (lv.disc) {
          const lim = lv.disc - PR;
          const r = Math.hypot(p.x, p.z);
          if (r > lim) {
            const nx = p.x / r,
              nz = p.z / r;
            p.x = nx * lim;
            p.z = nz * lim;
            const vn = s.vx * nx + s.vz * nz;
            if (vn > 0) ((s.vx -= vn * nx), (s.vz -= vn * nz));
          }
        } else {
          const lx = lv.rect![0] - PR,
            lz = lv.rect![1] - PR;
          if (p.x < -lx) ((p.x = -lx), (s.vx = Math.max(0, s.vx)));
          if (p.x > lx) ((p.x = lx), (s.vx = Math.min(0, s.vx)));
          if (p.z < -lz) ((p.z = -lz), (s.vz = Math.max(0, s.vz)));
          if (p.z > lz) ((p.z = lz), (s.vz = Math.min(0, s.vz)));
        }
      }
    }
  }

  /**
   * The chasm: cross it only on an open bridge (its rails keep you on the deck); elsewhere its lip is a
   * wall. The closed stretches are boxes with round corners: a bridge's mouth is slid into, not snapped to.
   */
  private chasm(s: Seat) {
    const p = s.a.pos;
    for (const b of this.gapWalls) {
      if (!outOfBox(p, PR, b)) continue;
      // (along the lip or the rail: only the speed into it is lost)
      const into = s.vx * HIT.nx + s.vz * HIT.nz;
      if (into < 0) ((s.vx -= into * HIT.nx), (s.vz -= into * HIT.nz));
    }
    if (Math.abs(p.x) >= this.lv.gap!.g) s.side = p.x < 0 ? -1 : 1;
  }

  /** The holder touches someone: the wallet hops over to them. */
  private passCheck() {
    const h = this.holder;
    if (h < 0) return;
    const hs = this.st[h];
    if (hs.stun > 0 || hs.hop > 0) return;
    let best = -1,
      bd = Infinity;
    for (let j = 0; j < 4; j++) {
      if (j === h) continue;
      const o = this.st[j];
      if (o.out || o.immune > 0 || o.hop > 0) continue;
      const d = Math.hypot(o.a.pos.x - hs.a.pos.x, o.a.pos.z - hs.a.pos.z);
      const r = hs.dash > 0 || o.dash > 0 ? TAG_DASH : TAG_R;
      if (d < r && d < bd) ((bd = d), (best = j));
    }
    if (best < 0) return;
    const o = this.st[best];
    this.passFrom.copy(this.wallet.position);
    this.passT = 0;
    this.holder = best;
    hs.immune = IMMUNE;
    hs.a.body.holdArms(false);
    hs.target = -1;
    o.stun = STUN;
    o.hurt = 0.45;
    o.target = -1;
    o.think = 0;
    o.a.jump(7);
    o.a.hit();
    // a little shove apart
    const dx = o.a.pos.x - hs.a.pos.x,
      dz = o.a.pos.z - hs.a.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    hs.vx -= (dx / d) * 5;
    hs.vz -= (dz / d) * 5;
    hs.dash = 0;
    o.vx += (dx / d) * 3;
    o.vz += (dz / d) * 3;
    this.v1.set((hs.a.pos.x + o.a.pos.x) / 2, 1.3, (hs.a.pos.z + o.a.pos.z) / 2);
    this.fx.burst(this.v1, 22, ["#ffffff", "#ffd23f", this.players[best].color, this.players[h].color], { speed: 6, up: 4, size: 0.15, life: 0.6 });
    this.cam.shake(0.22);
    this.au.tone(620, 0.09, "square", 0.32, 2.4);
    this.au.tone(1660, 0.08, "square", 0.22, 0, (this.au.ctx()?.currentTime ?? 0) + 0.06);
    this.au.noise(0.08, 0.25, 0, "highpass", 3000);
    this.pop(this.v1.setY(0), this.players[best].human ? T("YOURS!", "给你！") : T("POP!", "啪！"), this.players[best].human ? "#ff4a3a" : "#ffd23f");
    if (this.players[h].human) this.pops.push({ x: hs.a.pos.x, y: 2.9, z: hs.a.pos.z, s: T("PHEW!", "呼！"), c: "#8ee35b", t0: this.t + 0.15, size: 24 });
  }

  // ---- the floor, for the AI -------------------------------------------------------------------

  /** Which roof a point is on (SKYBRIDGE: −1 west, 1 east; elsewhere 1). */
  private sideOf(x: number) {
    return this.lv.gap && x < 0 ? -1 : 1;
  }

  /**
   * The way from (x0, z0) to (x1, z1): straight on one floor; over the chasm, through the best open
   * crossing (a bridge, or a spring pad). Sets wx, wz (the next waypoint) and lx, lz (where the way
   * comes out on the far roof); returns its length.
   */
  private route(x0: number, z0: number, x1: number, z1: number) {
    this.wx = this.lx = x1;
    this.wz = this.lz = z1;
    this.padHint = false;
    const g = this.lv.gap;
    if (!g) return Math.hypot(x1 - x0, z1 - z0);
    const s1 = x1 < 0 ? -1 : 1;
    if (Math.abs(x0) < g.g) {
      // (on a bridge: off it at the far end)
      const ex = s1 * (g.g + 0.7);
      this.wx = this.lx = ex;
      this.wz = this.lz = z0;
      return Math.hypot(ex - x0, 0) + Math.hypot(x1 - ex, z1 - z0);
    }
    const s0 = x0 < 0 ? -1 : 1;
    if (s0 === s1) return Math.hypot(x1 - x0, z1 - z0);
    let best = Infinity;
    for (let k = 0; k < g.bridges.length; k++) {
      const b = g.bridges[k];
      if (!this.bOpen[k]) continue;
      // (a bridge about to lift is no way to go)
      let c = 0;
      if (k === this.liftB || (this.liftB < 0 && k === this.liftNext && this.liftIn < 1.2)) c += 7;
      const ex = s0 * (g.g + 0.7),
        fx = s1 * (g.g + 0.7);
      c += Math.hypot(ex - x0, b.z - z0) + 2 * (g.g + 0.7) + Math.hypot(x1 - fx, z1 - b.z);
      if (c < best) {
        best = c;
        this.lx = fx;
        this.lz = b.z;
        // (lined up with the deck and near its mouth: straight over; else to its mouth)
        const lined = Math.abs(z0 - b.z) < b.hz - PR - 0.05 && Math.abs(x0) < g.g + 1.3;
        this.wx = lined ? fx : ex;
        this.wz = b.z;
        this.padHint = false;
      }
    }
    for (let k = 0; k < g.pads.length; k++) {
      const pz = g.pads[k];
      const c = Math.hypot(s0 * g.padX - x0, pz - z0) + 3.2 + Math.hypot(x1 - s1 * g.landX, z1 - pz);
      if (c < best) {
        best = c;
        this.wx = s0 * g.padX;
        this.wz = pz;
        this.lx = s1 * g.landX;
        this.lz = pz;
        this.padHint = true;
      }
    }
    return best;
  }

  /** A point kept on the floor (into qx, qz). */
  private fit(x: number, z: number) {
    const lv = this.lv;
    if (lv.disc) {
      const lim = lv.disc - PR;
      const r = Math.hypot(x, z);
      const k = r > lim ? lim / r : 1;
      this.qx = x * k;
      this.qz = z * k;
    } else {
      this.qx = clamp(x, -lv.rect![0] + PR, lv.rect![0] - PR);
      this.qz = clamp(z, -lv.rect![1] + PR, lv.rect![1] - PR);
    }
  }

  /** How far to the floor's edge. */
  private edge(x: number, z: number) {
    const lv = this.lv;
    return lv.disc ? lv.disc - Math.hypot(x, z) : Math.min(lv.rect![0] - Math.abs(x), lv.rect![1] - Math.abs(z));
  }

  // ---- the AI ----------------------------------------------------------------------------------

  private ai(i: number, dt: number) {
    const s = this.st[i];
    s.panic = Math.max(0, s.panic - dt);
    s.think -= dt;
    if (s.panic > 0) {
      // (a panic: a frantic zigzag, re-picked every few frames)
      if (s.think <= 0) {
        const r = this.rnd() * Math.PI * 2;
        s.gx = Math.sin(r);
        s.gz = Math.cos(r);
        s.gk = 1;
        s.think = 0.14;
      }
      return;
    }
    if (s.think > 0 || s.hop > 0) return;
    const sk = this.players[i].skill;
    s.think = lerp(0.34, 0.07, sk) * (0.7 + this.rnd() * 0.6);
    if (i === this.holder) this.aiChase(i, sk);
    else if (this.holder >= 0) this.aiFlee(i, sk);
    else this.aiSpread(i);
  }

  /** The holder: after the easiest victim (the nearest, the cornered, where they will be), a dash to close. */
  private aiChase(i: number, sk: number) {
    const s = this.st[i];
    const me = s.a.pos;
    const k = this.heat();
    const gap = !!this.lv.gap;
    let best = -1,
      bc = Infinity,
      px = 0,
      pz = 0;
    let open = 0;
    for (let j = 0; j < 4; j++) if (j !== i && !this.st[j].out && this.st[j].immune <= 0) open++;
    for (let j = 0; j < 4; j++) {
      const o = this.st[j];
      if (j === i || o.out) continue;
      if (o.immune > 0 && open > 0) continue;
      const d = Math.hypot(o.a.pos.x - me.x, o.a.pos.z - me.z);
      const lead = sk * clamp(d / 8, 0, 0.7);
      this.fit(o.a.pos.x + (o.vx + o.cx) * lead, o.a.pos.z + (o.vz + o.cz) * lead);
      let tx = this.qx,
        tz = this.qz;
      // (over the chasm: where they stand, its side kept)
      if (gap && this.sideOf(tx) !== this.sideOf(o.a.pos.x) && o.hop <= 0) tx = o.a.pos.x;
      let c: number;
      if (gap && this.sideOf(me.x) !== this.sideOf(tx)) c = this.route(me.x, me.z, tx, tz);
      else {
        c = Math.hypot(tx - me.x, tz - me.z);
        if (this.blocked(me.x, me.z, tx, tz)) c += 2.5 * (0.4 + sk);
      }
      c -= sk * 2.4 * this.cornered(o.a.pos.x, o.a.pos.z);
      if (j === s.target) c -= 1.4 - k;
      c += (1 - sk) * this.rnd() * 3;
      if (c < bc) ((bc = c), (best = j), (px = tx), (pz = tz));
    }
    s.target = best;
    if (best < 0) ((s.gk = 0), (s.gx = 0), (s.gz = 0));
    else {
      this.route(me.x, me.z, px, pz);
      this.steer(i, me.x, me.z, this.wx - me.x, this.wz - me.z, 1.1 + sk, 0.6, 1.8);
      s.gx = this.sx;
      s.gz = this.sz;
      s.gk = 1;
      // the dash: in range, a clear line; the good ones pick the moment, the others jump the gun
      const d = Math.hypot(px - me.x, pz - me.z);
      const lo = lerp(0.8, 1.5, sk),
        hi = lerp(5.5, 3.1, sk);
      if (s.cd <= 0 && d > lo && d < hi && !this.blocked(me.x, me.z, px, pz) && this.rnd() < (0.18 + 0.55 * sk) * (0.6 + k)) {
        s.want = true;
        // (on the turntable the good ones aim off for its carry)
        const tt = (sk * Math.min(DASH_T, d / DASH_V)) / DASH_T;
        const ax = (px - me.x) / d - (s.cx / DASH_V) * tt,
          az = (pz - me.z) / d - (s.cz / DASH_V) * tt;
        const al = Math.hypot(ax, az) || 1;
        s.wantX = ax / al;
        s.wantZ = az / al;
      }
    }
  }

  /** Not holding it: keep away, round the props; the good ones keep off the corners, the others panic into them. */
  private aiFlee(i: number, sk: number) {
    const s = this.st[i];
    const me = s.a.pos;
    const h = this.st[this.holder];
    const k = this.heat();
    const gp = this.lv.gap;
    const lead = sk * 0.45;
    let hx = h.a.pos.x + h.vx * lead,
      hz = h.a.pos.z + h.vz * lead;
    let dx: number, dz: number, d: number;
    const across = !!gp && this.sideOf(me.x) !== this.sideOf(h.a.pos.x) && Math.abs(h.a.pos.x) >= gp.g;
    if (across) {
      // (the holder is on the other roof: the danger is where its way lands on this one)
      d = this.route(h.a.pos.x, h.a.pos.z, me.x, me.z);
      hx = this.lx;
      hz = this.lz;
      dx = me.x - hx;
      dz = me.z - hz;
      const l = Math.hypot(dx, dz) || 0.01;
      dx /= l;
      dz /= l;
    } else {
      dx = me.x - hx;
      dz = me.z - hz;
      d = Math.hypot(dx, dz) || 0.01;
      dx /= d;
      dz /= d;
    }
    const hunted = h.target === i || (this.players[this.holder].human && this.nearestTo(this.holder) === i);
    const safe = lerp(3.4, 6.2, sk) + (hunted ? 2 : 0) + k * 2 * sk;
    let gx: number,
      gz: number,
      gk: number;
    let wantPad = false;
    if (d > safe) {
      // calm: drift toward an open spot far from the holder (the good ones), or mill about
      if (sk > 0.45) {
        let bs = -Infinity,
          bx = 0,
          bz = 0;
        for (const [cx, cz] of this.lv.spots) {
          let sc = (gp ? this.route(h.a.pos.x, h.a.pos.z, cx, cz) : Math.hypot(cx - hx, cz - hz)) - 0.35 * (gp ? this.route(me.x, me.z, cx, cz) : Math.hypot(cx - me.x, cz - me.z));
          for (let j = 0; j < 4; j++) if (j !== i && j !== this.holder && !this.st[j].out) sc -= Math.max(0, 3 - Math.hypot(cx - this.st[j].a.pos.x, cz - this.st[j].a.pos.z));
          if (sc > bs) ((bs = sc), (bx = cx), (bz = cz));
        }
        this.route(me.x, me.z, bx, bz);
        wantPad = this.padHint;
        gx = this.wx - me.x;
        gz = this.wz - me.z;
        gk = Math.hypot(bx - me.x, bz - me.z) > 1 ? 0.55 + 0.3 * sk : 0;
      } else {
        const r = this.rnd() * Math.PI * 2;
        gx = Math.sin(r) + dx * 0.6;
        gz = Math.cos(r) + dz * 0.6;
        gk = 0.35 + this.rnd() * 0.3;
      }
    } else {
      gx = dx;
      gz = dz;
      gk = 1;
      if (sk > 0.4) {
        // off the walls, toward the middle, before the corner closes
        const wall = this.edge(me.x, me.z);
        // (a round floor has no corners to fear: only a little pull, or they would run onto the turntable)
        const pull = sk * Math.max(0, 1 - wall / 3) * (this.lv.disc ? 0.5 : 1.6);
        const mcx = gp ? this.sideOf(me.x) * (gp.g + (this.lv.rect![0] - gp.g) / 2) : 0;
        const cl = Math.hypot(me.x - mcx, me.z) || 1;
        gx -= ((me.x - mcx) / cl) * pull;
        gz -= (me.z / cl) * pull;
        // and round a prop: its far side from the holder
        let bo = -1,
          bd = 4.2;
        const bl = this.lv.belt;
        const rIn = bl ? Math.hypot(me.x, me.z) < bl.r0 : false;
        for (let o = 0; o < this.lv.obst.length; o++) {
          const ob = this.lv.obst[o];
          // (HAWKER NIGHT: no hiding behind a prop on the far side of the turntable)
          if (bl && rIn !== Math.hypot(ob.x, ob.z) < bl.r0) continue;
          const od = Math.hypot(ob.x - me.x, ob.z - me.z);
          if (od < bd) ((bd = od), (bo = o));
        }
        if (bo >= 0) {
          const o = this.lv.obst[bo];
          let ox = o.x - hx,
            oz = o.z - hz;
          const ol = Math.hypot(ox, oz) || 1;
          ox /= ol;
          oz /= ol;
          const r = (o.r ?? Math.max(o.hx, o.hz)) + 1.1;
          const tx = o.x + ox * r - me.x,
            tz = o.z + oz * r - me.z;
          const tl = Math.hypot(tx, tz) || 1;
          // (only if getting there doesn't mean running at the holder)
          if ((tx / tl) * -dx + (tz / tl) * -dz < 0.3) {
            gx += (tx / tl) * sk * 0.9;
            gz += (tz / tl) * sk * 0.9;
          }
        }
        // SKYBRIDGE: over to the other roof, by a crossing reached well before the holder
        if (gp && !across) {
          const ws = this.escape(i, h.a.pos.x, h.a.pos.z);
          if (ws > 0) {
            const tx = this.wx - me.x,
              tz = this.wz - me.z;
            const tl = Math.hypot(tx, tz) || 1;
            const kk = sk * Math.min(1.6, 0.6 + ws * 0.25);
            gx += (tx / tl) * kk;
            gz += (tz / tl) * kk;
            wantPad = this.padHint;
          }
        }
      }
      // the others are a crowd to keep out of (the holder loves a crowd)
      for (let j = 0; j < 4; j++) {
        if (j === i || j === this.holder || this.st[j].out) continue;
        const ox = me.x - this.st[j].a.pos.x,
          oz = me.z - this.st[j].a.pos.z;
        const od = Math.hypot(ox, oz) || 1;
        if (od < 2.2) ((gx += (ox / od) * (2.2 - od) * 0.4), (gz += (oz / od) * (2.2 - od) * 0.4));
      }
      // a poor one freezes or flails when it gets close
      if (d < 2.6 && this.rnd() < (1 - sk) * 0.22) s.panic = 0.3 + this.rnd() * 0.4;
    }
    this.padHint = wantPad;
    this.steer(i, me.x, me.z, gx, gz, lerp(0.7, 2.2, sk), lerp(0.25, 1.6, sk), 1.8);
    s.gx = this.sx;
    s.gz = this.sz;
    s.gk = gk;
    // the dodge: a dash out of the holder's way (the good ones sideways, to the open side; late, but not too late)
    if (s.cd > 0 || across) return;
    const cvx = h.vx - s.vx,
      cvz = h.vz - s.vz;
    const closing = -(cvx * dx + cvz * dz);
    const dodge = lerp(2.5, 1.9, sk) + (h.dash > 0 ? 1 : 0);
    if (d < dodge && closing > 1.5 && this.rnd() < lerp(0.3, 0.85, sk)) {
      let px = -dz,
        pz = dx;
      if (sk > 0.5) {
        const a1 = Math.min(this.rayWall(me.x, me.z, px, pz, 3), this.rayObst(me.x, me.z, px, pz, 3));
        const a2 = Math.min(this.rayWall(me.x, me.z, -px, -pz, 3), this.rayObst(me.x, me.z, -px, -pz, 3));
        if (a2 > a1) ((px = -px), (pz = -pz));
      } else if (this.rnd() < 0.5) ((px = -px), (pz = -pz));
      const mixA = sk > 0.5 ? 0.35 : 0.8;
      s.want = true;
      s.wantX = px + dx * mixA;
      s.wantZ = pz + dz * mixA;
      const l = Math.hypot(s.wantX, s.wantZ) || 1;
      s.wantX /= l;
      s.wantZ /= l;
    } else if (sk < 0.5 && d < 4.5 && this.rnd() < (0.5 - sk) * 0.35) {
      // (a nervous one wastes it early)
      s.want = true;
      s.wantX = dx;
      s.wantZ = dz;
    }
  }

  /**
   * SKYBRIDGE: a way over to the other roof that this one reaches well before the holder (and not
   * toward it). Sets wx, wz (and padHint); returns its lead (m, 0: none).
   */
  private escape(i: number, hx: number, hz: number) {
    const g = this.lv.gap!;
    const me = this.st[i].a.pos;
    const s0 = this.sideOf(me.x);
    this.escLead = 0;
    for (let k = 0; k < g.bridges.length; k++) {
      const b = g.bridges[k];
      if (!this.bOpen[k] || k === this.liftB) continue;
      const ex = s0 * (g.g + 0.7);
      const lined = Math.abs(me.z - b.z) < b.hz - PR - 0.05 && Math.abs(me.x) < g.g + 1.3;
      this.escTry(me, hx, hz, ex, b.z, lined ? -s0 * (g.g + 0.7) : ex, b.z, false);
    }
    for (const pz of g.pads) this.escTry(me, hx, hz, s0 * g.padX, pz, s0 * g.padX, pz, true);
    return this.escLead;
  }
  private escLead = 0;
  /** One way over for escape(): its mouth (ex, ez), the waypoint to steer to. */
  private escTry(me: THREE.Vector3, hx: number, hz: number, ex: number, ez: number, wx: number, wz: number, pad: boolean) {
    const md = Math.hypot(ex - me.x, ez - me.z),
      hd = Math.hypot(ex - hx, ez - hz);
    const lead = hd - md - 1;
    if (lead <= this.escLead) return;
    // (not past the holder)
    const tx = ex - me.x,
      tz = ez - me.z,
      ux = hx - me.x,
      uz = hz - me.z;
    if ((tx * ux + tz * uz) / ((Math.hypot(tx, tz) || 1) * (Math.hypot(ux, uz) || 1)) > 0.45) return;
    this.escLead = lead;
    this.wx = wx;
    this.wz = wz;
    this.padHint = pad;
  }

  /** No wallet out (the roulette): spread out, off the others. */
  private aiSpread(i: number) {
    const s = this.st[i];
    const me = s.a.pos;
    const gp = this.lv.gap;
    // (toward the middle of its own floor)
    const mcx = gp ? this.sideOf(me.x) * (gp.g + (this.lv.rect![0] - gp.g) / 2) : 0;
    let gx = -(me.x - mcx) * 0.15,
      gz = -me.z * 0.15;
    for (let j = 0; j < 4; j++) {
      if (j === i || this.st[j].out) continue;
      const ox = me.x - this.st[j].a.pos.x,
        oz = me.z - this.st[j].a.pos.z;
      const od = Math.hypot(ox, oz) || 1;
      if (od < 4.5) ((gx += (ox / od) * (4.5 - od)), (gz += (oz / od) * (4.5 - od)));
    }
    const l = Math.hypot(gx, gz);
    this.padHint = false;
    this.steer(i, me.x, me.z, gx, gz, 1.2, 1, 1.5);
    s.gx = this.sx;
    s.gz = this.sz;
    s.gk = l > 0.4 ? 0.5 : 0;
  }

  /**
   * The best of sixteen ways toward (gx, gz), away from walls and props within `look` (into sx, sz).
   * On the turntable, a way is judged by where it really takes you (your run plus its carry).
   */
  private steer(i: number, x: number, z: number, gx: number, gz: number, look: number, wallW: number, obstW: number) {
    const l = Math.hypot(gx, gz);
    if (l < 1e-4) {
      this.sx = this.sz = 0;
      return;
    }
    const ux = gx / l,
      uz = gz / l;
    const s = this.st[i];
    const cx = s.cx / SPEED,
      cz = s.cz / SPEED;
    let best = -Infinity;
    for (let k = 0; k < ND; k++) {
      const dx = DX[k],
        dz = DZ[k];
      let sc: number;
      if (cx || cz) {
        const ex = dx + cx,
          ez = dz + cz;
        sc = (ex * ux + ez * uz) / (Math.hypot(ex, ez) || 1);
      } else sc = dx * ux + dz * uz;
      const ho = this.rayObst(x, z, dx, dz, look);
      if (ho < look) sc -= (1 - ho / look) * obstW;
      const hw = this.rayWall(x, z, dx, dz, look);
      if (hw < look) sc -= (1 - hw / look) * wallW;
      if (sc > best) ((best = sc), (this.sx = dx), (this.sz = dz));
    }
  }

  /** How far along (dx, dz) before a prop or the chasm (grown by a radius), up to `max`; the spring pads too, unless heading for one. */
  private rayObst(x: number, z: number, dx: number, dz: number, max: number) {
    let best = max;
    for (const o of this.solid) {
      if (o.r) {
        best = Math.min(best, rayDisc(x - o.x, z - o.z, dx, dz, o.r + PR + 0.05, best));
        continue;
      }
      const hx = o.hx + PR + 0.05,
        hz = o.hz + PR + 0.05;
      let t0 = 0,
        t1 = best;
      if (Math.abs(dx) < 1e-6) {
        if (x < o.x - hx || x > o.x + hx) continue;
      } else {
        let a = (o.x - hx - x) / dx,
          b = (o.x + hx - x) / dx;
        if (a > b) {
          const c = a;
          a = b;
          b = c;
        }
        t0 = Math.max(t0, a);
        t1 = Math.min(t1, b);
        if (t0 > t1) continue;
      }
      if (Math.abs(dz) < 1e-6) {
        if (z < o.z - hz || z > o.z + hz) continue;
      } else {
        let a = (o.z - hz - z) / dz,
          b = (o.z + hz - z) / dz;
        if (a > b) {
          const c = a;
          a = b;
          b = c;
        }
        t0 = Math.max(t0, a);
        t1 = Math.min(t1, b);
        if (t0 > t1) continue;
      }
      if (t0 > 0) {
        if (t0 < best) best = t0;
        continue;
      }
      // (already against it, inside its grown box: only a way further in is shut, or every way would
      // look as bad as the next and the one through the prop would win)
      const ex = hx - Math.abs(x - o.x),
        ez = hz - Math.abs(z - o.z);
      if (ex < ez ? dx * (x - o.x) < 0 : dz * (z - o.z) < 0) best = 0;
    }
    const g = this.lv.gap;
    if (g && !this.padHint)
      for (const pz of g.pads) for (let sd = -1; sd <= 1; sd += 2) best = Math.min(best, rayDisc(x - sd * g.padX, z - pz, dx, dz, g.padR + PR, best));
    return best;
  }

  /** How far along (dx, dz) before the floor's edge, up to `max`. */
  private rayWall(x: number, z: number, dx: number, dz: number, max: number) {
    const lv = this.lv;
    if (lv.disc) {
      // (from inside the circle: where the ray leaves it)
      const L = lv.disc - PR;
      const b = x * dx + z * dz;
      const c = x * x + z * z - L * L;
      return clamp(-b + Math.sqrt(Math.max(0, b * b - c)), 0, max);
    }
    const lx = lv.rect![0] - PR,
      lz = lv.rect![1] - PR;
    let t = max;
    if (dx > 1e-6) t = Math.min(t, (lx - x) / dx);
    else if (dx < -1e-6) t = Math.min(t, (-lx - x) / dx);
    if (dz > 1e-6) t = Math.min(t, (lz - z) / dz);
    else if (dz < -1e-6) t = Math.min(t, (-lz - z) / dz);
    return Math.max(0, t);
  }

  /** Does a prop (or the chasm) stand between these two points? */
  private blocked(x0: number, z0: number, x1: number, z1: number) {
    const dx = x1 - x0,
      dz = z1 - z0;
    const l = Math.hypot(dx, dz);
    if (l < 0.3) return false;
    const was = this.padHint;
    this.padHint = true;
    const r = this.rayObst(x0, z0, dx / l, dz / l, l) < l - 0.3;
    this.padHint = was;
    return r;
  }

  /** 0…1: how boxed in a spot is (a corner 1, a wall some, the open floor 0; a round floor has no corners). */
  private cornered(x: number, z: number) {
    const lv = this.lv;
    if (lv.disc) return Math.max(0, 1 - (lv.disc - Math.hypot(x, z)) / 2.6) * 0.5;
    const ax = Math.max(0, 1 - (lv.rect![0] - Math.abs(x)) / 2.6),
      az = Math.max(0, 1 - (lv.rect![1] - Math.abs(z)) / 2.6);
    return Math.min(1, ax * az * 1.4 + Math.max(ax, az) * 0.35);
  }

  private nearestTo(i: number) {
    let best = -1,
      bd = Infinity;
    const p = this.st[i].a.pos;
    for (let j = 0; j < 4; j++) {
      const o = this.st[j];
      if (j === i || o.out || o.immune > 0) continue;
      const d = Math.hypot(o.a.pos.x - p.x, o.a.pos.z - p.z);
      if (d < bd) ((bd = d), (best = j));
    }
    return best;
  }

  // ---- the look --------------------------------------------------------------------------------

  /** Place and pose each snark: arms up under the wallet, faces for the moment, the blasted one spinning. */
  private pose(i: number, dt: number) {
    const s = this.st[i];
    const a = s.a;
    if (s.gone) return;
    a.sync(dt);
    const b = a.body;
    if (s.out) {
      a.root.position.y += 0.8;
      a.root.rotation.x = s.fly * 7;
      a.root.rotation.z = s.fly * 4.3;
      b.armR.rotation.set(-2.6 + Math.sin(this.t * 22) * 0.7, 0, -0.9);
      b.armL.rotation.set(-2.6 + Math.sin(this.t * 22 + 2) * 0.7, 0, 0.9);
      b.foreArmR.rotation.set(-0.3, 0, 0);
      b.foreArmL.rotation.set(-0.3, 0, 0);
      b.puppet.motion.expr = FACE.hurt;
      return;
    }
    const holding = i === this.holder && this.passT >= 0.6;
    b.holdArms(holding);
    if (holding) {
      const bob = Math.sin(this.t * 14) * 0.08;
      b.armR.rotation.set(-2.95 + bob, 0, -0.28);
      b.armL.rotation.set(-2.95 - bob, 0, 0.28);
      b.foreArmR.rotation.set(-0.55, 0, 0);
      b.foreArmL.rotation.set(-0.55, 0, 0);
    }
    if (a.marker) a.marker.visible = i !== this.holder;
    // invincible for a moment: a blink
    b.root.visible = s.immune <= 0 || Math.floor(this.t * 16) % 2 === 0;
    a.angry = i === this.holder && this.heat() < 0.7;
    if (s.hurt > 0) b.puppet.motion.expr = FACE.hurt;
    else if (i === this.holder && this.heat() >= 0.7) b.puppet.motion.expr = FACE.surprised;
    else if (this.holder >= 0 && i !== this.holder) {
      const hp = this.st[this.holder].a.pos;
      if (Math.hypot(hp.x - a.pos.x, hp.z - a.pos.z) < 2.6) b.puppet.motion.expr = FACE.surprised;
    }
  }

  /** The wallet: on the holder's head (or flying to it); it swells, reddens and pulses with the ticks. */
  private wallet3(dt: number) {
    const w = this.wallet;
    const k = this.heat();
    this.tickK += dt;
    const pulse = Math.exp(-this.tickK * 13);
    let show = false;
    if (this.holder >= 0) {
      const a = this.av[this.holder];
      this.v1.set(a.pos.x, a.pos.y + HOLD_Y + Math.abs(Math.sin(this.t * 7)) * 0.06 * Math.min(1, Math.hypot(this.st[this.holder].vx, this.st[this.holder].vz)), a.pos.z);
      if (this.passT < 1) {
        this.passT = Math.min(1, this.passT + dt / 0.24);
        const u = this.passT;
        w.position.lerpVectors(this.passFrom, this.v1, u);
        w.position.y += Math.sin(u * Math.PI) * 1.5;
        w.rotation.x = u * Math.PI * 2;
      } else {
        w.position.copy(this.v1);
        w.rotation.x = 0;
      }
      w.rotation.y = Math.sin(this.t * 2) * 0.35;
      show = true;
    } else if (this.phase === "pick" && this.dropT >= 0) {
      const a = this.av[this.next];
      const u = Math.min(1, this.dropT / DROP);
      w.position.set(a.pos.x, a.pos.y + HOLD_Y + (1 - u * u) * 8, a.pos.z);
      w.rotation.set(0, (1 - u) * 6, 0);
      show = true;
    }
    w.visible = show;
    const dk = clamp((k - 0.6) / 0.25, 0, 1);
    this.danger.visible = show && this.holder >= 0 && dk > 0;
    if (this.danger.visible) {
      const a = this.av[this.holder].pos;
      this.danger.position.set(a.x, 0.06, a.z);
      this.danger.scale.setScalar(4.8 + pulse * 0.5);
      this.dangerMat.opacity = dk * (0.35 + 0.5 * pulse);
    }
    this.pool.visible = show && this.holder >= 0;
    if (!show) return;
    const sc = 1 + 0.36 * k + pulse * (0.05 + 0.13 * k);
    const jit = k > 0.6 ? Math.sin(this.t * 47) * 0.035 * (k - 0.6) * 2.5 : 0;
    this.wBody.scale.set(sc * (1 + jit), sc * (1 - jit), sc);
    this.wBody.rotation.z = Math.sin(this.t * (8 + 34 * k)) * 0.08 * k;
    this.wMat.color.lerpColors(C_COOL, C_HOT, k);
    this.wMat.emissive.lerpColors(E_COOL, E_HOT, k).multiplyScalar(0.6 + 0.9 * pulse);
    if (k > 0.72 && pulse > 0.45) this.wMat.emissive.lerp(WHITE, 0.22);
    this.haloMat.color.lerpColors(L_COOL, L_HOT, k);
    this.haloMat.opacity = 0.05 + 0.2 * k + 0.16 * pulse;
    this.halo.scale.setScalar(1.25 + 0.75 * k + 0.3 * pulse);
    if (this.pool.visible) {
      const a = this.av[this.holder].pos;
      this.pool.position.set(a.x, 0.05, a.z);
      this.pool.scale.setScalar(2.4 + 1.4 * k + 0.4 * pulse);
      this.poolMat.color.copy(this.haloMat.color);
      this.poolMat.opacity = 0.25 + 0.4 * k + 0.25 * pulse;
    }
    this.spark.scale.setScalar(0.12 + Math.random() * 0.1 + 0.08 * k);
    this.spark.getWorldPosition(this.v2);
    const n = k > 0.55 ? 2 : 1;
    this.fx.burst(this.v2, n, SPARK, { speed: 2.2 + 2 * k, up: 2, gravity: 7, size: 0.07, life: 0.35, drag: 1 });
  }

  /** The threat: a dashed red line on the roof from the holder to its victim, a ring under them. */
  private threat() {
    const h = this.holder;
    let tg = -1;
    if (h >= 0 && this.phase === "play") tg = this.players[h].human ? this.nearestTo(h) : this.st[h].target;
    if (tg >= 0 && (this.st[tg].out || this.st[tg].immune > 0)) tg = -1;
    this.alertOn = false;
    if (tg < 0) {
      this.dashes.count = 0;
      this.aim.visible = false;
      return;
    }
    const a = this.av[h].pos,
      b = this.av[tg].pos;
    const dx = b.x - a.x,
      dz = b.z - a.z;
    const d = Math.hypot(dx, dz);
    if (d > 9 || d < 0.9) {
      this.dashes.count = 0;
      this.aim.visible = d <= 9;
      if (this.aim.visible) this.aim.position.set(b.x, 0.05, b.z);
      return;
    }
    this.alertOn = d < 4.5 && tg === this.human;
    this.q4.setFromAxisAngle(this.v2.set(0, 1, 0), Math.atan2(dx, dz));
    const step = 0.55;
    const from = 0.7,
      to = d - 0.8;
    const off = (this.t * 2.2) % step;
    let n = 0;
    for (let u = from + off; u < to && n < 18; u += step) {
      const f = clamp(Math.min(u - from, to - u) / 0.6, 0, 1);
      this.m4.compose(this.v1.set(a.x + (dx / d) * u, 0.05, a.z + (dz / d) * u), this.q4, this.s4.set(0.1 * f + 0.02, 0.02, 0.3 * f + 0.02));
      this.dashes.setMatrixAt(n++, this.m4);
    }
    this.dashes.count = n;
    this.dashes.instanceMatrix.needsUpdate = true;
    this.aim.visible = true;
    this.aim.position.set(b.x, 0.05, b.z);
    const p = 1.6 + Math.sin(this.t * 10) * 0.12;
    this.aim.scale.set(p, p, 1);
    this.aimMat.opacity = 0.45 + 0.4 * this.heat();
  }

  /** The level's life (its scenery's tick); the blast's shock; the twinkle; the roulette's beam. */
  private decor(dt: number) {
    this.scen.tick(dt, this.live);
    // the blast: its puffs and its ring
    this.shockT += dt;
    for (let k = 0; k < this.puffs.length; k++) {
      const m = this.puffs[k];
      const u = (this.shockT - this.puffD[k * 5 + 4]) / 0.62;
      m.visible = u > 0 && u < 1;
      if (!m.visible) continue;
      const r = this.puffD[k * 5 + 3] * (u < 0.22 ? backOut(u / 0.22) : 1 - Math.pow((u - 0.22) / 0.78, 2));
      const sp = 1 + u * 0.7;
      m.position.set(this.puffAt.x + this.puffD[k * 5] * sp, this.puffAt.y + this.puffD[k * 5 + 1] * sp + u * 0.9, this.puffAt.z + this.puffD[k * 5 + 2] * sp);
      m.scale.setScalar(Math.max(0.01, r * 2));
    }
    const u = this.shockT / 0.5;
    this.shockRing.visible = u < 1;
    if (u < 1) {
      this.shockRing.scale.setScalar(1 + 16 * u);
      this.shockRingMat.opacity = 0.85 * (1 - u);
    }
    // the twinkle where the blasted one vanished
    this.starT += dt;
    const sv = this.starT / 0.6;
    this.star.visible = sv < 1;
    if (sv < 1) {
      this.star.quaternion.copy(this.w.camera.quaternion);
      this.star.rotation.z = sv * 2;
      this.star.scale.setScalar(Math.sin(sv * Math.PI) * 3.2);
    }
    // the roulette's spotlight
    const ps = this.phase === "pick" && this.pickHop >= 0 ? this.pickSeq[this.pickHop] : -1;
    this.beam.visible = ps >= 0;
    if (ps >= 0) {
      const p = this.av[ps].pos;
      this.beam.position.set(p.x, 4.5, p.z);
      this.beamMat.opacity = 0.28 + (this.dropT >= 0 ? 0.15 : 0);
    }
  }

  view() {
    return this.w;
  }

  // ---- the HUD ---------------------------------------------------------------------------------

  draw(g: CanvasRenderingContext2D) {
    const cam = this.w.camera;
    const k = this.heat();
    const t = this.t;
    // the human's dread: red edges, pulsing with the ticks
    if (this.holder >= 0 && this.holder === this.human) {
      const a = (0.26 + 0.5 * k) * (0.6 + 0.4 * Math.exp(-this.tickK * 8));
      const gr = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.6);
      gr.addColorStop(0, "rgba(255,30,20,0)");
      gr.addColorStop(1, `rgba(255,30,20,${a})`);
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
    }
    // name tags (the holder's over the wallet)
    for (let i = 0; i < 4; i++) {
      const s = this.st[i];
      if (s.out) continue;
      const a = s.a;
      const y0 = i === this.holder ? this.wallet.position.y + 0.85 * this.wBody.scale.y : a.pos.y + 2.9;
      const p = toScreen(this.v1.set(a.pos.x, y0, a.pos.z), cam);
      if (!p.on) continue;
      // (at the far side: a tag that would sit under the round's pill drops below it)
      if (Math.abs(p.x - W / 2) < 130 && p.y < 66) p.y = 66;
      tag(g, this.players[i], p.x, p.y, s.immune > 0 ? 0.6 : 1);
      if (i === this.human && this.alertOn) {
        const b = 1 + Math.abs(Math.sin(t * 9)) * 0.15;
        g.save();
        g.translate(p.x, p.y - 30);
        g.scale(b, b);
        rr(g, -13, -15, 26, 30, 9);
        g.fillStyle = "#ffd23f";
        g.fill();
        g.lineWidth = 2.5;
        g.strokeStyle = "#140d00";
        g.stroke();
        text(g, "!", 0, 1, 22, "#140d00", "center", 900);
        g.restore();
      }
    }
    // the popups
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const q = this.pops[i];
      const u = (t - q.t0) / 0.85;
      if (u >= 1) {
        this.pops.splice(i, 1);
        continue;
      }
      if (u < 0) continue;
      const p = toScreen(this.v1.set(q.x, q.y, q.z), cam);
      if (!p.on) continue;
      const sc = u < 0.2 ? 0.6 + (u / 0.2) * 0.6 : 1.2 - (u - 0.2) * 0.25;
      g.save();
      g.globalAlpha = u > 0.7 ? (1 - u) / 0.3 : 1;
      g.translate(p.x, p.y - u * 34);
      g.scale(sc, sc);
      shout(g, q.s, 0, 0, q.size, q.c);
      g.restore();
    }
    // the corners: who's in, who has it, the places of the blasted
    const vals: string[] = [];
    const sub: string[] = [];
    const out: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      const s = this.st[i];
      const place = s.out ? 3 - this.outs.indexOf(i) : -1;
      out.push(s.out);
      vals.push(s.out ? ord(place) : "");
      sub.push(s.out ? T("BLASTED", "炸飞") : this.over ? T("WINNER!", "胜者！") : i === this.holder ? "" : s.immune > 0 ? T("SAFE", "安全") : T("RUN!", "快跑！"));
    }
    corners(g, this.players, vals, { out, sub, lead: this.over ? [this.over[0]] : undefined });
    if (this.holder >= 0) {
      const [x, y] = cornerSpot(this.holder);
      const pu = 0.5 + 0.5 * Math.exp(-this.tickK * 6);
      g.save();
      rr(g, x - 2, y - 2, 200, 62, 18);
      g.strokeStyle = `rgba(255,${(80 - 60 * k) | 0},40,${0.5 + 0.5 * pu})`;
      g.lineWidth = 3.5;
      g.stroke();
      g.restore();
      text(g, T("HOT!", "烫手！"), x + 58, y + 41, 11, "#ff5a3a", "left", 900);
      walletIcon(g, x + 166, y + 30, 0.9 + 0.12 * pu + 0.2 * k, k, t);
    }
    // the round, and who holds it
    this.drawTop(g, k, t);
    // the banners
    for (const b of this.banners) {
      const u = (t - b.t0) / b.dur;
      if (u > 0 && u < 1) banner(g, b.s, u, b.c, b.y, b.size);
    }
    if (this.banners.length && t - this.banners[0].t0 > this.banners[0].dur) this.banners.shift();
    // the blast's flash
    if (this.flash > 0) {
      g.fillStyle = `rgba(255,246,220,${this.flash * this.flash * 0.55})`;
      g.fillRect(0, 0, W, H);
    }
  }

  private drawTop(g: CanvasRenderingContext2D, k: number, t: number) {
    // the round pill with three wallets (the spent ones burst)
    const y = 32;
    // (a small screen: the whole pill grows about its middle until its letters read, wallets and all)
    grow(g, W / 2, y, 14, () => {
      rr(g, W / 2 - 94, y - 16, 188, 36, 18);
      g.fillStyle = "rgba(6,3,18,0.38)";
      g.fill();
      rr(g, W / 2 - 94, y - 19, 188, 36, 18);
      g.fillStyle = "rgba(20,14,48,0.86)";
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = "rgba(255,255,255,0.16)";
      g.stroke();
      text(g, T(`ROUND ${Math.min(3, this.round + 1)}/3`, `第 ${Math.min(3, this.round + 1)}/3 回合`), W / 2 - 34, y, 14, "#fff", "center", 900);
      for (let r = 0; r < 3; r++) {
        const x = W / 2 + 30 + r * 22;
        if (r < this.outs.length) {
          g.fillStyle = "rgba(255,255,255,0.25)";
          g.beginPath();
          g.arc(x, y - 1, 5, 0, Math.PI * 2);
          g.fill();
        } else walletIcon(g, x, y, 0.38, r === this.round ? k : 0, t);
      }
    });
    // who has it
    const h = this.holder >= 0 ? this.holder : this.phase === "pick" && this.dropT >= 0 ? this.next : -1;
    if (h < 0) {
      if (this.phase === "pick" && this.pickHop >= 0) shout(g, T("WHO GETS IT?", "轮到谁？"), W / 2, this.humanOut() ? 82 : H - 38, 28, "#ffd23f");
      return;
    }
    const p = this.players[h];
    const s = p.human ? T("YOU HAVE IT!", "钱包在你手上！") : T(`${short(p).toUpperCase()} HAS IT!`, `${short(p)} 拿着钱包！`);
    const pu = Math.exp(-this.tickK * 7);
    const sz = (p.human ? 36 : 28) * (1 + 0.08 * pu + 0.05 * k);
    const red = `rgb(255,${(64 - 40 * k + 150 * pu) | 0},${(52 - 30 * k + 120 * pu) | 0})`;
    // (at the bottom, under the play; at the top while the host's fast-forward pill has the bottom)
    shout(g, s, W / 2, this.humanOut() ? 82 : H - 38, sz, red);
    if (p.human && this.phase === "play") {
      // (a touch screen's button says what it does: the hint names the verb, not the letter)
      const a = actsOf("bomb").a;
      const key = touchy() && a ? actWord(a) : "A";
      shout(g, T(`Touch someone to pass it!  ${key}: a burst of speed`, `碰到别人就能传走！${key}：冲刺加速`), W / 2, H - 38 - sz * 0.62 - 12, 15, "#ffffff");
    }
  }

  result() {
    return this.over;
  }

  /** You were blasted and the rivals play on: the host fast-forwards. */
  humanOut() {
    return this.human >= 0 && this.st[this.human].out && !this.over;
  }

  dispose() {
    this.au.stop();
    music.rate(1);
    for (const a of this.av) a.dispose();
    disposeScene(this.w.scene);
  }
}

/** A little HOT WALLET on the HUD: its body, its flap, a fuse and a spark. */
function walletIcon(g: CanvasRenderingContext2D, x: number, y: number, s: number, k: number, t: number) {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.rotate(Math.sin(t * (8 + 30 * k)) * 0.12 * k);
  g.strokeStyle = "#ffd23f";
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(9, -10);
  g.quadraticCurveTo(14, -18, 18, -20);
  g.stroke();
  g.fillStyle = Math.sin(t * 30) > 0 ? "#fff6c0" : "#ff9a2e";
  g.beginPath();
  g.arc(18, -20, 3.5, 0, Math.PI * 2);
  g.fill();
  rr(g, -16, -11, 32, 23, 5);
  g.fillStyle = `rgb(255,${(122 - 90 * k) | 0},${(53 - 30 * k) | 0})`;
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = "#15101f";
  g.stroke();
  rr(g, -17, -11, 34, 10, 4);
  g.fillStyle = "#c2401b";
  g.fill();
  g.stroke();
  rr(g, -4, -5, 8, 8, 2);
  g.fillStyle = "#ffd23f";
  g.fill();
  g.restore();
}

/** A ray from (x, z) (relative to a disc's centre) along (dx, dz): how far before it meets the disc of radius r (max: none). */
function rayDisc(x: number, z: number, dx: number, dz: number, r: number, max: number) {
  const b = x * dx + z * dz;
  const c = x * x + z * z - r * r;
  // (inside it, against a round prop: only a way further in is shut)
  if (c <= 0) return b < 0 ? 0 : max;
  if (b > 0) return max;
  const q = b * b - c;
  if (q < 0) return max;
  return Math.min(max, -b - Math.sqrt(q));
}

export const BOMB: MiniDef = {
  key: "bomb",
  title: "HOT WALLET",
  titleZh: "烫手钱包",
  tag: "Don't be holding it when it blows",
  tagZh: "爆炸时别拿在手上",
  // (a touch screen's button reads DASH: the rules say so too)
  help: `Touch a rival to pass the ticking wallet on. ${touchy() ? "DASH is a burst of speed" : "A dashes"}. When it blows, its holder is out: last one standing wins.`,
  helpZh: `碰到对手就能把滴答作响的钱包传走，${touchy() ? "「冲刺」键加速" : "A 冲刺"}。爆炸时拿着它的人出局：最后留下的人获胜。`,
  pad: ["left", "right", "up", "down", "a"],
  tap: true,
  color: "#ff6b35",
  song: "tense",
  ambience: "city-day",
  variants: LEVELS.map((l) => ({ key: l.key, title: l.title, titleZh: l.titleZh, tag: l.tag, tagZh: l.tagZh, thumb: `bomb-${l.key}`, ...(l.song ? { song: l.song } : {}), ambience: l.ambience })),
  make: (players, rnd, variant) => new HotWallet(players, rnd, LEVELS.find((l) => l.key === variant) ?? LEVELS[Math.floor(rnd() * LEVELS.length) % LEVELS.length]),
};

export default BOMB;
