/**
 * BIG Z ROLL (巨Z滚滚来), in 3D: a giant golden Z-Block, eight metres a side, tumbles end over end
 * down a long road, face after face, THUD, THUD, and the four zkSNARKs run ahead of it. Hold ▲ to
 * run, ◀ ▶ to weave round the crates and the walls, A to jump the gaps and the low bars, B to shove a
 * rival (into a gap: the chaos). The dark square on the road ahead of the Z-Block is where it lands next:
 * be out of it when it slams down, or be flattened (and ride its face for a turn). Falling into a gap
 * is out too. The finishers rank by arrival; those out rank behind them, the later out the higher.
 *
 * Three levels (roll-levels/): SKY ROAD (high over ZStreet: crates, gaps, belts, swinging
 * balls), SPROUT ICE ROAD (over the frozen Sprout river: ice sheets and floes you slide on, blizzard
 * gusts that push you sideways) and MARINA ROOFTOPS (shophouse roofs by night: gaps between the roofs,
 * rafts gliding over rooftop pools). A level is its layout (course.ts chunks), its scenery, its sky
 * and light, its props' looks and its twist.
 *
 * The road is built in chunks, easy first, denser toward the goal. The Q speeds up slowly and closes
 * in on whoever is last when it is far behind, but a clean runner always outruns it: a missed jump,
 * a bonk on a wall, a trip on a bar cost real ground.
 * The AI by skill: how far ahead it reads the road (its line), its jump timing (late when poor),
 * getting stuck on walls (poor), waiting out the swinging balls and the rafts, bracing against the
 * gusts and shoving at the edges (good).
 *
 * Coordinates: the road runs along s (forward: world −z), x across it (world x), y up.
 */
import * as THREE from "three";
import { T } from "../../i18n/lang";
import { H, W, clamp, ease, inputOf, ord, rng, rr, sfx, sound, text, token, zoom, type Input, type IntroShot, type Mini, type MiniDef, type Player, type Rnd } from "../kit";
import { music } from "../music";
import { ACT } from "../acts";
import { touchy } from "../hud";
import { Avatar, CamRig, Fx3, GEO, banner, blob, canvasTex, clockK, disposeScene, glow, label, qBlock, short, tag, toScreen, toon, toonSteps, world, yawOf } from "../k3";
import { BAR, BR, Batch, CRATE, GOLD, Grid, HALF, INK, LIM, POOL_Y, PY, QS, SL, START, WALL, cellOf, chevTex, checkTex, hazTex, plankTex, type Floor, type Level, type Mover, type Raft, type Rect, type Scenery, type Solid } from "./roll-levels/kit";
import { Course } from "./roll-levels/course";
import { SKY } from "./roll-levels/sky";
import { ASTANA } from "./roll-levels/astana";
import { SINGAPORE } from "./roll-levels/singapore";

/** The levels, in the picker's order. */
export const LEVELS: Level[] = [SKY, ASTANA, SINGAPORE];

/** A runner's radius; the snarks' size. */
const RB = 0.4;
const MS = 1.15;
/** Running: forward, sideways, backward (m/s); the jump; gravity; a jump's time in the air. */
const V = 7.5;
const VL = 5.8;
const VB = 3.2;
const JV = 9.4;
const G = 27;
const AIR = (2 * JV) / G;
/** The step the falls are tuned at: a jump is as high at any frame rate as it is at 60 a second. */
const H0 = 1 / 60;
/** A jump still allowed this long after the edge; a press this long before landing still jumps. */
const COYOTE = 0.1;
const BUFFER = 0.14;
/** The belts' pull (toward the Q), a boost's length and its top speed. */
const BELT = -2.6;
const BOOST_T = 1.0;
const BOOST_V = V * 1.5;
/** Ice: the grip left (forward, sideways) and how slowly a shove dies away on it. */
const ICE_F = 0.34;
const ICE_L = 0.24;
const ICE_K = 1.3;
/** The gusts: the push (m/s sideways), the warning, the blow, the first one and the calm between. */
const GUST = 2.5;
const GUST_WARN = 1.7;
const GUST_BLOW = 2.1;
const GUST_FIRST = 7;
/** The Q's pause on each face (of a cycle), where it starts. */
const REST = 0.2;
const Q0 = 1;
/** The time cap (s). */
const CAP = 100;
/** The play camera: its height, how far behind the Q's centre, where it looks (ahead of it). */
const CAM_H = 23;
const CAM_BACK = 4;
const CAM_AHEAD = 16;
/**
 * A touch stick's tilt is a point in a circle: run and dodge at once is its diagonal, 0.7 of each,
 * where two held keys give all of both. The tilt is stretched by this much (and capped), so a thumb
 * up and to a side runs as fast as the keys do.
 */
const STICK_K = 1.5;
/** Where the announcer's lines stand (under the bar, over the far road: never on the runners). */
const SAY_Y = 132;

const RUN = 0;
const CLIMB = 1;
const FALL = 2;
const FLAT = 3;
const DONE = 4;
const FLUNG = 5;

/** Props the Q flattens as it lands on them (an arch, a gantry). */
interface Crush {
  s: number;
  objs: THREE.Object3D[];
  colors: string[];
  dead: boolean;
}

const markTex = () =>
  canvasTex(128, 128, (g) => {
    g.fillStyle = "rgba(90,0,30,0.6)";
    g.fillRect(0, 0, 128, 128);
    // (diagonal warning bands across it)
    g.fillStyle = "rgba(255,40,80,0.22)";
    for (let i = -128; i < 128; i += 32) {
      g.beginPath();
      g.moveTo(i, 128);
      g.lineTo(i + 14, 128);
      g.lineTo(i + 142, 0);
      g.lineTo(i + 128, 0);
      g.closePath();
      g.fill();
    }
    g.fillStyle = "#ff2e4d";
    g.fillRect(0, 0, 128, 10);
    g.fillRect(0, 118, 128, 10);
    g.fillRect(0, 0, 7, 128);
    g.fillRect(121, 0, 7, 128);
    g.fillStyle = "#ffffff";
    for (let i = 0; i < 128; i += 32) {
      g.fillRect(i + 8, 0, 14, 10);
      g.fillRect(i + 8, 118, 14, 10);
      g.fillRect(0, i + 8, 7, 14);
      g.fillRect(121, i + 8, 7, 14);
    }
  });

/** Ice: pale blue, glossy streaks, a few cracks and glints. */
const iceTex = () =>
  canvasTex(
    128,
    128,
    (g) => {
      g.fillStyle = "#8fdcff";
      g.fillRect(0, 0, 128, 128);
      g.strokeStyle = "rgba(255,255,255,0.75)";
      g.lineWidth = 5;
      for (let i = -1; i < 4; i++) {
        g.beginPath();
        g.moveTo(i * 40, 128);
        g.lineTo(i * 40 + 60, 0);
        g.stroke();
      }
      g.lineWidth = 2;
      g.strokeStyle = "rgba(80,150,210,0.7)";
      g.beginPath();
      g.moveTo(10, 30);
      g.lineTo(38, 52);
      g.lineTo(30, 80);
      g.moveTo(38, 52);
      g.lineTo(70, 60);
      g.moveTo(90, 100);
      g.lineTo(112, 84);
      g.lineTo(124, 96);
      g.stroke();
      g.fillStyle = "#ffffff";
      for (const [x, y] of [
        [20, 100],
        [64, 22],
        [104, 50],
        [84, 116],
      ])
        g.fillRect(x - 2, y - 2, 5, 5);
    },
    true,
  );
/** Pool water: blue with light ripples. */
const poolTex = () =>
  canvasTex(
    64,
    64,
    (g) => {
      g.fillStyle = "#1fa8d8";
      g.fillRect(0, 0, 64, 64);
      g.strokeStyle = "#7fe4ff";
      g.lineWidth = 3;
      for (let y = 8; y < 64; y += 16) {
        g.beginPath();
        for (let x = 0; x <= 64; x += 8) g.lineTo(x, y + (x % 16 ? 3 : -3));
        g.stroke();
      }
    },
    true,
  );

// ---- a little synth of its own -------------------------------------------------------------------

function beep(f: number, d: number, type: OscillatorType = "square", vol = 0.3, slide = 1, delay = 0) {
  const a = sound();
  if (!a) return;
  const t = a.ac.currentTime + delay;
  const o = a.ac.createOscillator();
  const g = a.ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (slide !== 1) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + d);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(a.bus);
  o.start(t);
  o.stop(t + d + 0.02);
}
const boom = (k = 1) => (sfx.thud(), beep(70, 0.45, "sine", 0.55 * k, 0.5), beep(46, 0.6, "triangle", 0.4 * k, 0.7));
const splat = () => (sfx.hit(), beep(240, 0.25, "sawtooth", 0.3, 0.25));
const boing = () => beep(300, 0.35, "triangle", 0.4, 3.2);
const hop = () => beep(420, 0.12, "square", 0.16, 1.9);
const zip = () => (beep(500, 0.22, "square", 0.18, 3), beep(750, 0.22, "triangle", 0.15, 3, 0.05));
const scream = () => beep(900, 0.9, "sawtooth", 0.16, 0.3);
const splash = () => (beep(260, 0.35, "sawtooth", 0.22, 0.2), beep(900, 0.25, "triangle", 0.12, 0.4, 0.04));
const whistle = () => (beep(520, 1.2, "sine", 0.16, 1.9), beep(780, 1.0, "triangle", 0.08, 1.6, 0.15));

// ---- the game ------------------------------------------------------------------------------------

interface AI {
  tx: number;
  /** Its line needs a quick sidestep: ease off. */
  slow: boolean;
  stuckCd: number;
  next: number;
  err: number;
  hz: number;
  hes: boolean;
  stuck: number;
  swing: number;
  wait: boolean;
  /** The gust it last saw, and whether it braces against it. */
  gust: number;
  brace: boolean;
  /** The raft it is going for (a pool), its misjudgement of where it will be, and whether it just goes. */
  raft: Raft | null;
  rerr: number;
  rush: boolean;
}

interface Run {
  i: number;
  p: Player;
  a: Avatar;
  ai: AI | null;
  s: number;
  x: number;
  y: number;
  vs: number;
  vx: number;
  vy: number;
  kx: number;
  grounded: boolean;
  coyote: number;
  buf: number;
  st: number;
  stun: number;
  bonkCd: number;
  boost: number;
  shove: number;
  shoveDir: number;
  shoveCd: number;
  climb: number;
  edge: number;
  out: number;
  outS: number;
  place: number;
  front: boolean;
  lands: number;
  peel: number;
  spin: number;
  cheer: number;
  angry: number;
  lat: number;
  /** The raft it hangs from (a ledge caught on a raft). */
  on: Raft | null;
  splash: boolean;
}

/** The bar's heads, back to front: the rivals by their place on the road, the visitor last (on top). */
const barSort = (a: Run, b: Run) => (a.p.human ? 1 : 0) - (b.p.human ? 1 : 0) || a.s - b.s;

class Roll implements Mini {
  private w: ReturnType<typeof world>;
  private c: Course;
  private fl: Grid<Floor>;
  private sol: Grid<Solid>;
  private beltG: Grid<Rect>;
  private padG: Grid<Rect>;
  private iceG: Grid<Rect>;
  private poolG: Grid<Rect>;
  private scen: Scenery;
  // the gusts: 0 calm, 1 the warning, 2 blowing; their strength now (0..1), their side, how many so far
  private gPhase = 0;
  private gT = 0;
  private gNext = GUST_FIRST;
  private gk = 0;
  private gWarn = 0;
  private gDir = 1;
  private gN = 0;
  private flagSpots: { x: number; y: number; s: number; side: number }[] = [];
  private flagB!: Batch;
  // the rafts
  private raftB: Batch | null = null;
  private raftTop: Batch | null = null;
  private poolTex: THREE.Texture | null = null;
  private R: Run[];
  private hu: number;
  private fx: Fx3;
  private cam: CamRig;
  private t = 0;
  private it = 0;
  private over: number[] | null = null;
  private arrivals: number[] = [];
  private outs: Run[] = [];
  // the Q
  private qSq = new THREE.Group();
  private qRot = new THREE.Group();
  private qMesh: THREE.Mesh;
  private qf = Q0;
  private qk = 0;
  private qu = 0;
  private qv = 5.9;
  private qTheta = 0;
  private qLandT = 9;
  private qWait = 0.6;
  private qStopped = false;
  private qStopT = 0;
  private qBurst = false;
  private qcs = Q0 - QS / 2;
  private qGlow = 0;
  private mark: THREE.Mesh;
  private markMat: THREE.MeshBasicMaterial;
  // the props
  private solidB: Batch[] = [];
  private moverB: Batch;
  private ballB: Batch;
  private chainB: Batch;
  private ballSh: Batch;
  private crush: Crush[] = [];
  private beltTex: THREE.Texture;
  private padTex: THREE.Texture;
  private padMat: THREE.MeshBasicMaterial;
  /** The scenery's own random (never the game's: one more number drawn from that changes the race). */
  private drnd = rng(0x51ce);
  private balloonB!: Batch;
  private balloons: { x: number; y: number; s: number; ph: number; r: number }[] = [];
  private banners: { s: string; t: number; d: number; c: string; size: number }[] = [];
  private said = new Set<string>();
  private from: { eye: THREE.Vector3; at: THREE.Vector3 } | null = null;
  // scratch
  private v = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private eye = new THREE.Vector3();
  private at = new THREE.Vector3();
  private m4 = new THREE.Matrix4();
  private qa = new THREE.Quaternion();
  private ce = new THREE.Euler();
  /** The bench (partylab): a tally of what happened; &rolldbg: a hint for a scripted human. */
  private lab = typeof location !== "undefined" && location.pathname.includes("partylab");
  private dbg = this.lab && location.search.includes("rolldbg");
  private hintAI: AI | null = null;
  private hintN = 0;
  private stats = { bonk: 0, trip: 0, catch: 0, shove: 0, shoveHit: 0, swingHit: 0, moverHit: 0, boost: 0, splash: 0, raftJump: 0, gusts: 0 };
  private log: string[] = [];
  private note(r: Run, what: string) {
    if (this.lab && this.log.length < 60) this.log.push(`${this.t.toFixed(1)} #${r.i} ${what} s${r.s.toFixed(0)} x${r.x.toFixed(1)}`);
  }
  private cmx = 0;
  private cmy = 0;
  /** The visitor just flattened: the camera stays on the Q (and them on its face) a moment. */
  private focusQ = 0;

  constructor(
    players: Player[],
    private rnd: Rnd,
    private L: Level,
  ) {
    const P = L.props;
    this.w = world({ sky: L.sky, fog: L.fog, fov: 40, post: L.post });
    if (L.shadowK !== undefined) this.w.scene.userData.shadowK = L.shadowK;
    this.c = new Course(rnd, L);
    this.fl = new Grid(this.c.floors);
    this.sol = new Grid(this.c.solids);
    this.beltG = new Grid(this.c.belts);
    this.padG = new Grid(this.c.pads);
    this.iceG = new Grid(this.c.ices);
    this.poolG = new Grid(this.c.pools);
    const s = this.w.scene;
    this.w.hemi.color.set(L.hemi[0]);
    this.w.hemi.groundColor.set(L.hemi[1]);
    this.w.hemi.intensity = L.hemi[2];
    this.w.sun.color.set(L.sun[0]);
    this.w.sun.intensity = L.sun[1];
    this.w.sun.position.set(L.sun[2], L.sun[3], L.sun[4]);
    const ink = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
    this.buildRoad(ink);
    this.scen = L.scenery({ scene: s, fin: this.c.fin, floors: this.c.floors, pools: this.c.pools, ground: (ss, x) => this.ground(ss, x) });
    this.buildIce();
    this.buildPools(ink);
    // the obstacles
    const crateMat = new THREE.MeshToonMaterial({ map: P.crate(), gradientMap: toonSteps() });
    const barMat = new THREE.MeshToonMaterial({ map: P.bar(), gradientMap: toonSteps() });
    const kinds = [crateMat, toon(P.wall[0]), barMat];
    const count = [0, 0, 0];
    for (const o of this.c.solids) count[o.kind]++;
    this.solidB = kinds.map((m, k) => new Batch(s, GEO.box, m, count[k], ink, 0.05));
    const caps = new Batch(s, GEO.box, toon(P.wall[1]), count[WALL]);
    for (const o of this.c.solids) {
      const w = o.x1 - o.x0,
        d = o.s1 - o.s0;
      o.n = this.solidB[o.kind].put((o.x0 + o.x1) / 2, o.h / 2, -(o.s0 + o.s1) / 2, w, o.h, d);
      if (o.kind === WALL) caps.put((o.x0 + o.x1) / 2, o.h + 0.08, -(o.s0 + o.s1) / 2, w + 0.12, 0.16, d + 0.12);
    }
    for (const b of this.solidB) b.done();
    caps.done();
    this.wallCaps = caps;
    this.moverB = new Batch(s, GEO.box, new THREE.MeshToonMaterial({ map: P.mover(), gradientMap: toonSteps() }), this.c.movers.length, ink, 0.05);
    const tracks = new Batch(s, GEO.plane, glow(P.track), this.c.movers.length, undefined);
    for (const m of this.c.movers) {
      m.x = this.moverX(m, 0);
      this.moverB.put(m.x, m.h / 2, -m.s, m.w, m.h, m.d);
      tracks.put(0, 0.012, -m.s, HALF * 2 - 0.2, m.d * 0.5, 1, undefined, 0, true);
    }
    this.moverB.done();
    tracks.done();
    // the swinging balls on their gantries
    const ns = this.c.swings.length;
    this.ballB = new Batch(s, GEO.ball, new THREE.MeshToonMaterial({ map: P.ball(), gradientMap: toonSteps() }), ns, ink, 0.06);
    this.chainB = new Batch(s, GEO.box, toon(P.chain), ns);
    this.ballSh = new Batch(s, GEO.plane, blob(1).material as THREE.Material, ns);
    for (const sw of this.c.swings) {
      this.ballB.put(0, 1, -sw.s, BR * 2, BR * 2, BR * 2);
      this.chainB.put(0, 4, -sw.s, 0.14, SL, 0.14);
      this.ballSh.put(0, 0.03, -sw.s, 2.2, 2.2, 1, undefined, 0, true);
      const gantry: THREE.Object3D[] = [];
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(GEO.box, toon(P.gantry[0]));
        post.scale.set(0.5, PY + 0.4, 0.5);
        post.position.set(side * (HALF + 0.55), (PY + 0.4) / 2, -sw.s);
        const cap = new THREE.Mesh(GEO.box, toon(P.gantry[1]));
        cap.scale.set(0.7, 0.4, 0.7);
        cap.position.set(side * (HALF + 0.55), PY + 0.55, -sw.s);
        s.add(post, cap);
        gantry.push(post, cap);
      }
      const beam = new THREE.Mesh(GEO.box, toon(P.gantry[0]));
      beam.scale.set(HALF * 2 + 1.6, 0.45, 0.45);
      beam.position.set(0, PY + 0.2, -sw.s);
      s.add(beam);
      gantry.push(beam);
      this.crush.push({ s: sw.s, objs: gantry, colors: [P.gantry[0], P.gantry[1]], dead: false });
    }
    this.ballB.done();
    this.chainB.done();
    this.ballSh.done();
    // the belts (chevrons rolling toward the Q) and the boost pads (chevrons racing ahead)
    this.beltTex = chevTex(P.belt[0], P.belt[1], false);
    this.beltTex.wrapS = this.beltTex.wrapT = THREE.RepeatWrapping;
    let nb = 0;
    for (const b of this.c.belts) nb += Math.ceil(b.s1 - b.s0) * Math.ceil(b.x1 - b.x0);
    const belts = new Batch(s, GEO.plane, new THREE.MeshBasicMaterial({ map: this.beltTex }), nb);
    for (const b of this.c.belts) {
      const nx = Math.ceil(b.x1 - b.x0),
        nz = Math.ceil(b.s1 - b.s0);
      const tw = (b.x1 - b.x0) / nx,
        td = (b.s1 - b.s0) / nz;
      for (let i = 0; i < nz; i++) for (let j = 0; j < nx; j++) belts.put(b.x0 + (j + 0.5) * tw, 0.014, -(b.s0 + (i + 0.5) * td), tw, td, 1, undefined, 0, true);
    }
    belts.done();
    this.padTex = chevTex("#0f7a4a", "#b6ffd2", true);
    this.padTex.wrapS = this.padTex.wrapT = THREE.RepeatWrapping;
    this.padMat = new THREE.MeshBasicMaterial({ map: this.padTex });
    const pads = new Batch(s, GEO.plane, this.padMat, this.c.pads.length * 2);
    for (const p of this.c.pads) {
      const cx = (p.x0 + p.x1) / 2;
      pads.put(cx, 0.016, -(p.s0 + 0.45), 1.8, 0.9, 1, undefined, 0, true);
      pads.put(cx, 0.016, -(p.s0 + 1.35), 1.8, 0.9, 1, undefined, 0, true);
    }
    pads.done();
    this.buildArches();
    this.buildDecor();
    // the Q
    this.qMesh = qBlock(QS);
    this.qRot.add(this.qMesh);
    this.qSq.add(this.qRot);
    s.add(this.qSq);
    this.markMat = new THREE.MeshBasicMaterial({ map: markTex(), transparent: true, depthWrite: false, opacity: 0.4 });
    this.mark = new THREE.Mesh(GEO.plane, this.markMat);
    this.mark.rotation.x = -Math.PI / 2;
    this.mark.scale.set(HALF * 2, QS, 1);
    this.mark.renderOrder = 4;
    s.add(this.mark);
    this.placeQ(0);
    // the runners on the line
    this.hu = players.findIndex((p) => p.human);
    const xs = [-2.6, -0.87, 0.87, 2.6];
    this.R = players.map((p, i) => {
      const a = new Avatar(s, p, { scale: MS });
      const r: Run = {
        i,
        p,
        a,
        ai: p.human ? null : { tx: xs[i], slow: false, stuckCd: 0, next: 0.3 + rnd() * 0.3, err: 0, hz: 0, hes: false, stuck: 0, swing: -1, wait: false, gust: 0, brace: false, raft: null, rerr: 0, rush: false },
        s: START,
        x: xs[i],
        y: 0,
        vs: 0,
        vx: 0,
        vy: 0,
        kx: 0,
        grounded: true,
        coyote: COYOTE,
        buf: 0,
        st: RUN,
        stun: 0,
        bonkCd: 0,
        boost: 0,
        shove: 0,
        shoveDir: 1,
        shoveCd: 0,
        climb: 0,
        edge: 0,
        out: -1,
        outS: 0,
        place: -1,
        front: false,
        lands: 0,
        peel: 0,
        spin: 0,
        cheer: 0,
        angry: 0,
        lat: i < 2 ? 1 : -1,
        on: null,
        splash: false,
      };
      a.pos.set(r.x, 0, -r.s);
      a.yaw = Math.PI;
      a.sync(0);
      return r;
    });
    this.fx = new Fx3(s);
    this.cam = new CamRig(this.w.camera);
    this.cardCam(0);
    this.cam.apply(0);
  }
  private wallCaps: Batch;

  // ---- building ----------------------------------------------------------------------------------

  private buildRoad(ink: THREE.Material) {
    const s = this.w.scene;
    const F = this.c.floors;
    let slabs = 0,
      planks = 0,
      kerbs = 0;
    for (const f of F) {
      const len = f.s1 - f.s0;
      if (f.wood) planks += Math.ceil(len / 0.9) + 1;
      else slabs += Math.ceil(len / 4) + 1;
      kerbs += Math.ceil(len / 2) * 2 + 2;
    }
    const R = this.L.road;
    // (the slabs in their two shades, each with its own painted top: seams, lines)
    const tops = R.slab.map((c) => {
      const map = R.tex(c);
      return new Batch(s, GEO.box, new THREE.MeshToonMaterial({ map, gradientMap: toonSteps(), ...(R.lift ? { emissive: "#ffffff", emissiveMap: map, emissiveIntensity: R.lift } : {}) }), slabs);
    });
    const plank = new Batch(s, GEO.box, new THREE.MeshToonMaterial({ map: plankTex(), gradientMap: toonSteps() }), planks);
    const body = new Batch(s, GEO.box, toon(R.body), F.length);
    const girder = R.girder ? new Batch(s, GEO.box, toon(R.girder), F.length) : null;
    const inkB = new Batch(s, GEO.box, ink, F.length);
    const kerb = new Batch(s, GEO.box, toon("#ffffff"), kerbs);
    const beams = new Batch(s, GEO.box, toon(R.beam), F.length * 2);
    F.forEach((f, idx) => {
      const w = f.x1 - f.x0,
        cx = (f.x0 + f.x1) / 2,
        len = f.s1 - f.s0;
      if (f.wood) {
        // planks over two beams
        const dy = idx % 2 ? 0 : -0.02;
        const n = Math.max(1, Math.round(len / 0.9));
        const pl = len / n;
        for (let i = 0; i < n; i++) plank.put(cx, -0.14 + dy, -(f.s0 + (i + 0.5) * pl), w, 0.28, pl - 0.07, R.plank[i % 2]);
        for (const side of [-1, 1]) beams.put(cx + side * (w / 2 - 0.25), -0.42, -(f.s0 + len / 2), 0.3, 0.3, len);
        inkB.put(cx, -0.3, -(f.s0 + len / 2), w + 0.1, 0.62, len + 0.1);
        return;
      }
      // slabs on a 4 m grid (two shades), on a body, a dark girder under the middle
      let a = f.s0;
      while (a < f.s1 - 0.01) {
        const b = Math.min(f.s1, (Math.floor(a / 4 + 1e-6) + 1) * 4);
        tops[Math.floor(a / 4 + 1e-6) % 2 ? 1 : 0].put(cx, -0.15, -(a + b) / 2, w, 0.3, b - a);
        a = b;
      }
      body.put(cx, -0.6, -(f.s0 + len / 2), w, 0.6, len);
      inkB.put(cx, -0.45, -(f.s0 + len / 2), w + 0.1, 1.0, len + 0.1);
      if (girder && w > 5 && len > 4) girder.put(cx, -1.6, -(f.s0 + len / 2), 2.6, 1.4, len - 2.4);
      // the kerbs, two colours, where the road meets its edge
      for (const side of [-1, 1]) {
        if ((side < 0 ? f.x0 : f.x1) * side < HALF - 0.01) continue;
        let k = f.s0;
        while (k < f.s1 - 0.01) {
          const e = Math.min(f.s1, (Math.floor(k / 2 + 1e-6) + 1) * 2);
          kerb.put(side * (HALF + 0.25), 0.22, -(k + e) / 2, 0.5, 0.6, e - k, R.kerb[Math.floor(k / 2 + 1e-6) % 2 ? 1 : 0]);
          k = e;
        }
      }
    });
    for (const b of [...tops, plank, body, girder, inkB, kerb, beams]) b?.done();
    // hazard stripes on every edge that drops into the void
    const hz = new THREE.MeshBasicMaterial({ map: hazTex(), polygonOffset: true, polygonOffsetFactor: -1 });
    // (the pools' rafts don't count: a deck's edge over the water is an edge)
    const tiles: number[] = [];
    for (const f of F) {
      const w = f.x1 - f.x0;
      const nx = Math.max(1, Math.round(w / 1.05));
      const tw = w / nx;
      for (let j = 0; j < nx; j++) {
        const x = f.x0 + (j + 0.5) * tw;
        if (!this.ground(f.s1 + 0.3, x)) tiles.push(x, f.s1 - 0.3, tw, 0.6);
        if (!this.ground(f.s0 - 0.3, x)) tiles.push(x, f.s0 + 0.3, tw, 0.6);
      }
      // a bridge's sides
      if (f.wood)
        for (const side of [-1, 1]) {
          const ex = side < 0 ? f.x0 : f.x1;
          const n = Math.max(1, Math.round((f.s1 - f.s0) / 1.2));
          const td = (f.s1 - f.s0) / n;
          for (let i = 0; i < n; i++) {
            const sm = f.s0 + (i + 0.5) * td;
            if (!this.ground(sm, ex + side * 0.3)) tiles.push(ex - side * 0.14, sm, 0.28, td);
          }
        }
    }
    const hb = new Batch(s, GEO.plane, hz, tiles.length / 4);
    for (let i = 0; i < tiles.length; i += 4) hb.put(tiles[i], 0.012, -tiles[i + 1], tiles[i + 2], tiles[i + 3], 1, undefined, 0, true);
    hb.done();
    // the pylons down from the road
    if (R.pylon) {
      const [col, deep] = R.pylon;
      const py = new Batch(s, GEO.box, toon(col), 20);
      for (let a = 0; a < this.c.fin + 40; a += 34) if (this.ground(a, 0) && this.ground(a, -3)) py.put(0, (-0.9 + deep) / 2, -a, 1.6, -0.9 - deep, 1.6);
      py.done();
    }
  }

  /** The ice sheets: glossy pale-blue decals over the road. */
  private buildIce() {
    const I = this.c.ices;
    if (!I.length) return;
    let n = 0;
    for (const r of I) n += Math.ceil((r.s1 - r.s0) / 2.2) * Math.ceil((r.x1 - r.x0) / 2.2);
    const mat = new THREE.MeshBasicMaterial({ map: iceTex(), polygonOffset: true, polygonOffsetFactor: -2 });
    const b = new Batch(this.w.scene, GEO.plane, mat, n);
    const rim = new Batch(this.w.scene, GEO.plane, glow("#e8fbff"), I.length * 2);
    for (const r of I) {
      const nx = Math.ceil((r.x1 - r.x0) / 2.2),
        nz = Math.ceil((r.s1 - r.s0) / 2.2);
      const tw = (r.x1 - r.x0) / nx,
        td = (r.s1 - r.s0) / nz;
      for (let i = 0; i < nz; i++) for (let j = 0; j < nx; j++) b.put(r.x0 + (j + 0.5) * tw, 0.014, -(r.s0 + (i + 0.5) * td), tw, td, 1, undefined, (i + j) % 2 ? 0 : Math.PI, true);
      // (a frosty rim where it starts and ends)
      rim.put((r.x0 + r.x1) / 2, 0.016, -(r.s0 + 0.12), r.x1 - r.x0, 0.24, 1, undefined, 0, true);
      rim.put((r.x0 + r.x1) / 2, 0.016, -(r.s1 - 0.12), r.x1 - r.x0, 0.24, 1, undefined, 0, true);
    }
    b.done();
    rim.done();
  }

  /** The rooftop pools: water, glass sides, a glowing lane for each raft, and the rafts. */
  private buildPools(ink: THREE.Material) {
    const P = this.c.pools;
    if (!P.length) return;
    const s = this.w.scene;
    this.poolTex = poolTex();
    this.poolTex.repeat.set(3, 3);
    const water = new Batch(s, GEO.plane, new THREE.MeshBasicMaterial({ map: this.poolTex }), P.length);
    const sides = new Batch(s, GEO.box, toon("#bff4ff", "#1a4a5a"), P.length * 2);
    const rims = new Batch(s, GEO.box, toon("#ffffff"), P.length * 2);
    for (const p of P) {
      const len = p.s1 - p.s0;
      water.put(0, POOL_Y, -(p.s0 + len / 2), HALF * 2 + 0.9, len, 1, undefined, 0, true);
      for (const side of [-1, 1]) {
        sides.put(side * (HALF + 0.3), (POOL_Y - 0.6 + 0.35) / 2, -(p.s0 + len / 2), 0.4, 0.35 - (POOL_Y - 0.6), len);
        rims.put(side * (HALF + 0.3), 0.42, -(p.s0 + len / 2), 0.52, 0.14, len + 0.2);
      }
    }
    water.done();
    sides.done();
    rims.done();
    const F = this.c.rafts;
    const lanes = new Batch(s, GEO.plane, glow("#7ff0ff", 0.35, true), F.length);
    const cols = ["#ff5fa2", "#ffd23f", "#3ec6ff", "#8ee35b", "#ff8a3d"];
    this.raftB = new Batch(s, GEO.box, toon("#ffffff"), F.length, ink, 0.05);
    this.raftTop = new Batch(s, GEO.box, toon("#ffffff"), F.length * 2);
    F.forEach((f, i) => {
      lanes.put(0, POOL_Y + 0.02, -(f.s0 + f.s1) / 2, (f.amp + f.w / 2) * 2, (f.s1 - f.s0) * 0.5, 1, undefined, 0, true);
      f.x = f.amp * Math.sin(f.ph);
      this.raftB!.put(f.x, -0.3, -(f.s0 + f.s1) / 2, f.w, 0.56, f.s1 - f.s0, cols[i % cols.length]);
      this.raftTop!.put(f.x, 0.0, -(f.s0 + f.s1) / 2, f.w - 0.5, 0.06, f.s1 - f.s0 - 0.5, "#ffffff");
      this.raftTop!.put(f.x, 0.02, -(f.s0 + f.s1) / 2, f.w - 0.9, 0.06, f.s1 - f.s0 - 0.9, cols[(i + 2) % cols.length]);
    });
    lanes.done();
    this.raftB.done();
    this.raftTop.done();
  }

  private buildArches() {
    const s = this.w.scene;
    const chk = checkTex(16, 2);
    chk.wrapS = THREE.RepeatWrapping;
    const lineMat = new THREE.MeshBasicMaterial({ map: chk, polygonOffset: true, polygonOffsetFactor: -1 });
    const arch = (at: number, word: string, color: string, big: boolean) => {
      const objs: THREE.Object3D[] = [];
      const hgt = big ? 7.2 : 9.4;
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(GEO.box, toon(color));
        post.scale.set(0.8, hgt, 0.8);
        post.position.set(side * (HALF + 0.75), hgt / 2, -at);
        const o = new THREE.Mesh(GEO.box, new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }));
        o.scale.set(1 + 0.12 / 0.8, 1 + 0.12 / hgt, 1 + 0.12 / 0.8);
        post.add(o);
        s.add(post);
        objs.push(post);
        if (big) {
          const q = qBlock(1.4);
          q.position.set(side * (HALF + 0.75), hgt + 1.2, -at);
          q.userData.spin = side;
          s.add(q);
          objs.push(q);
          this.archQ.push(q);
        }
      }
      const beam = new THREE.Mesh(GEO.box, toon(color));
      beam.scale.set(HALF * 2 + 2.4, 1.5, 0.7);
      beam.position.set(0, hgt - 0.4, -at);
      s.add(beam);
      objs.push(beam);
      const strip = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: checkTex(16, 1) }));
      strip.scale.set(HALF * 2 + 2.4, 0.3, 1);
      strip.position.set(0, hgt - 1.32, -at + 0.36);
      s.add(strip);
      objs.push(strip);
      const lb = label(word, 1.25, "#ffffff");
      lb.position.set(0, hgt - 0.35, -at + 0.37);
      s.add(lb);
      objs.push(lb);
      const line = new THREE.Mesh(GEO.plane, lineMat);
      line.rotation.x = -Math.PI / 2;
      line.scale.set(HALF * 2, 0.8, 1);
      line.position.set(0, 0.013, -at);
      s.add(line);
      return objs;
    };
    const [c0, c1] = this.L.props.arch;
    this.crush.push({ s: START - 1.4, objs: arch(START - 1.4, T("START", "起点"), c0, false), colors: [c0, "#ffffff"], dead: false });
    arch(this.c.fin, T("GOAL", "终点"), c1, true);
  }
  private archQ: THREE.Mesh[] = [];

  private buildDecor() {
    const s = this.w.scene;
    const rnd = this.drnd;
    const P = this.L.props;
    // lamps and flags on the kerbs (a flag is two halves, so it ripples; it streams out downwind in a gust)
    const posts = new Batch(s, GEO.box, toon(P.post), 60);
    const lamps = new Batch(s, GEO.box, glow(P.lamp), 60);
    this.flagB = new Batch(s, GEO.box, toon("#ffffff"), 120);
    const fc = P.flags;
    let k = 0;
    for (let a = 6; a < this.c.fin + 30; a += 9) {
      const side = k++ % 2 ? 1 : -1;
      if (!this.ground(a, side * (HALF - 0.2))) continue;
      const x = side * (HALF + 0.25);
      if (k % 3 === 0) {
        posts.put(x, 1.6, -a, 0.16, 2.6, 0.16);
        lamps.put(x, 3.0, -a, 0.5, 0.5, 0.5);
      } else {
        posts.put(x, 2.1, -a, 0.12, 3.6, 0.12);
        this.flagSpots.push({ x, y: 3.3, s: a, side });
        for (let h = 0; h < 2; h++) this.flagB.put(x + side * (0.26 + h * 0.5), 3.3, -a, 0.52, 0.7, 0.06, fc[k % fc.length]);
      }
    }
    posts.done();
    lamps.done();
    this.flagB.done();
    // balloons by the arches
    this.balloonB = new Batch(s, GEO.ball, toon("#ffffff"), 36);
    const spots = [START - 1.4, this.c.fin];
    for (const at of spots)
      for (const side of [-1, 1])
        for (let i = 0; i < 7; i++) this.balloons.push({ x: side * (HALF + 1.6 + rnd() * 1.6), y: 3 + rnd() * 4.5, s: at + (rnd() - 0.5) * 3, ph: rnd() * 6, r: 0.55 + rnd() * 0.25 });
    for (let i = 0; i < this.balloons.length; i++) {
      const b = this.balloons[i];
      this.balloonB.put(b.x, b.y, -b.s, b.r * 2, b.r * 2.3, b.r * 2, fc[i % fc.length]);
    }
    this.balloonB.done();
  }

  // ---- queries -----------------------------------------------------------------------------------

  /** Is there road (or a raft, at time `ta`) under (s, x)? (A little give at the edges.) */
  private floorAt(s: number, x: number, m = 0.12, ta = this.it) {
    return this.fl.has(s, x, m) !== null || (this.c.rafts.length > 0 && this.raftAt(s, x, m, ta) !== null);
  }
  /** The road itself (no rafts), no give. */
  private ground(s: number, x: number) {
    return this.fl.has(s, x, 0) !== null;
  }
  private raftX(f: Raft, t: number) {
    return f.amp * Math.sin(f.om * t + f.ph);
  }
  /** The raft under (s, x) at time `ta`. */
  private raftAt(s: number, x: number, m = 0.12, ta = this.it): Raft | null {
    if (!this.poolG.has(s, x, 0.5)) return null;
    for (const f of this.c.rafts) if (!f.dead && s >= f.s0 - m && s < f.s1 + m && Math.abs(x - (ta === this.it ? f.x : this.raftX(f, ta))) <= f.w / 2 + m) return f;
    return null;
  }
  private moverX(m: Mover, t: number) {
    return m.dead ? m.x : m.amp * Math.sin(m.om * t + m.ph);
  }
  /** Something solid there (at time `ta` for the sliding blocks)? */
  private blockedAt(s: number, x: number, ta: number) {
    const m = RB + 0.12;
    for (let c = cellOf(s - m); c <= cellOf(s + m); c++)
      for (const o of this.sol.cell(c)) if (!o.dead && o.kind !== BAR && s > o.s0 - m && s < o.s1 + m && x > o.x0 - m && x < o.x1 + m) return true;
    for (const mv of this.c.movers)
      if (!mv.dead && Math.abs(s - mv.s) < mv.d / 2 + m) {
        if (Math.abs(x - this.moverX(mv, ta)) < mv.w / 2 + m + 0.25) return true;
      }
    return false;
  }
  /** How far beyond `s` (a void) along x the road comes back (0: not within a jump). */
  private landing(s: number, x: number, ta = this.it) {
    for (let d = 0.4; d <= 3.6; d += 0.4) if (this.floorAt(s + d, x, 0, ta)) return d;
    return 0;
  }

  // ---- the Q -------------------------------------------------------------------------------------

  private placeQ(jit: number) {
    const th = this.qTheta;
    const r = QS / Math.SQRT2;
    const phi = (3 * Math.PI) / 4 - th;
    const cs = this.qf + Math.cos(phi) * r;
    const cy = Math.sin(phi) * r;
    this.qcs = cs;
    // (each landing squashes it a little: its bottom stays on the road)
    const tl = this.qLandT;
    const k = th > 0 ? 0 : 0.1 * Math.exp(-7 * tl) * Math.cos(tl * 22);
    this.qSq.position.set(jit, 0, -cs);
    this.qSq.scale.set(1 + k * 0.6, 1 - k, 1 + k * 0.6);
    this.qRot.position.set(0, cy, 0);
    this.qRot.rotation.x = -(this.qk * Math.PI) / 2 - th;
    // its next landing, on the road ahead
    const rolling = this.qu >= REST && !this.qStopped;
    const rk = rolling ? (this.qu - REST) / (1 - REST) : 0;
    this.mark.visible = !this.qStopped && !this.qBurst;
    this.mark.position.set(0, 0.035, -(this.qf + QS / 2));
    this.markMat.opacity = rolling ? 0.6 + 0.4 * rk : 0.55 + Math.sin(this.it * 9) * 0.08;
    this.markMat.color.setRGB(1, rolling ? 1 - rk * 0.35 : 1, rolling ? 1 - rk * 0.35 : 1);
  }

  private qSpeed() {
    const base = Math.min(7.2, 5.9 + 0.03 * this.t);
    let rear = Infinity;
    for (const r of this.R) if (r.st === RUN || r.st === CLIMB) rear = Math.min(rear, r.s);
    const gap = rear === Infinity ? 0 : rear - this.qf;
    const hu = this.hu >= 0 ? this.R[this.hu] : null;
    // (once the visitor is home, it hurries the rest along)
    const band = hu && hu.st === DONE ? 11 : 17;
    return base + clamp((gap - band) * 0.22, 0, 2.4);
  }

  /** Where its front face can reach a runner `hb` tall right now. */
  private danger(hb: number) {
    if (this.qu < REST || this.qStopped || this.qBurst) return this.qf;
    const t = Math.tan(Math.PI / 2 - this.qTheta);
    return this.qf + Math.min(QS, t > 1e-4 ? hb / t : QS);
  }

  private stepQ(dt: number) {
    this.qLandT += dt;
    this.qGlow = Math.max(0, this.qGlow - dt * 1.5);
    const mat = this.qMesh.material as THREE.MeshToonMaterial;
    mat.emissive.setRGB(0.23 + this.qGlow * 0.6, 0.15 + this.qGlow * 0.05, 0);
    if (this.qBurst) return;
    if (this.qWait > 0) {
      this.qWait -= dt;
      this.placeQ(Math.sin(this.it * 60) * 0.06);
      return;
    }
    if (this.qStopped) {
      this.placeQ(0);
      return;
    }
    this.qv = this.qSpeed();
    const was = this.qu;
    this.qu += (dt * this.qv) / QS;
    // (not past the goal: it stops at the arch)
    if (was < REST && this.qu >= REST && this.qf + QS > this.c.fin - 0.6) {
      this.qStopped = true;
      this.qStopT = this.t;
      this.qu = 0;
      this.qTheta = 0;
      this.placeQ(0);
      return;
    }
    if (this.qu >= 1) {
      this.qu -= 1;
      this.qf += QS;
      this.qk++;
      this.qTheta = 0;
      this.land();
    } else if (this.qu >= REST) {
      const r = (this.qu - REST) / (1 - REST);
      this.qTheta = (Math.PI / 2) * r * r * (0.4 + 0.6 * r);
    } else this.qTheta = 0;
    this.placeQ(0);
  }

  /** THUD: shake, dust, and everything under its face flattened. */
  private land() {
    this.qLandT = 0;
    const near = this.hu >= 0 && (this.R[this.hu].st === RUN || this.R[this.hu].st === CLIMB) ? clamp(1.3 - (this.R[this.hu].s - this.qf) / 40, 0.45, 1) : 0.7;
    this.cam.shake(0.55 * near);
    boom(near);
    const f = this.qf;
    for (let i = 0; i < 6; i++) this.fx.burst(this.v.set(-HALF + 0.4 + i * 1.5, 0.3, -f), 4, ["#fff6e2", "#d8cfee", "#ffffff"], { speed: 5, up: 3, size: 0.32, life: 0.7, dir: this.v2.set(0, 0, -3) });
    for (const side of [-1, 1]) this.fx.burst(this.v.set(side * HALF, 0.3, -(f - QS / 2)), 6, ["#fff6e2", "#d8cfee"], { speed: 5, up: 3, size: 0.35, life: 0.7 });
    const a = f - QS,
      b = f;
    for (const o of this.c.solids)
      if (!o.dead && o.s1 > a && o.s0 < b) {
        o.dead = true;
        const w = o.x1 - o.x0,
          d = o.s1 - o.s0;
        this.solidB[o.kind].put((o.x0 + o.x1) / 2, 0.06, -(o.s0 + o.s1) / 2, w, 0.12, d, undefined, 0, false, o.n);
        const cols = this.L.props.bits[o.kind === CRATE ? 0 : o.kind === WALL ? 1 : 2];
        this.fx.burst(this.v.set((o.x0 + o.x1) / 2, 0.5, -(o.s0 + o.s1) / 2), 10, cols, { speed: 7, up: 5, size: 0.3 });
      }
    // (the wall caps go flat with their walls)
    let wi = 0;
    for (const o of this.c.solids)
      if (o.kind === WALL) {
        if (o.dead) this.wallCaps.put((o.x0 + o.x1) / 2, 0.13, -(o.s0 + o.s1) / 2, o.x1 - o.x0 + 0.12, 0.02, o.s1 - o.s0 + 0.12, undefined, 0, false, wi);
        wi++;
      }
    this.c.movers.forEach((m, i) => {
      if (m.dead || m.s > b || m.s < a) return;
      m.dead = true;
      this.moverB.put(m.x, 0.08, -m.s, m.w * 1.15, 0.16, m.d * 1.15, undefined, 0, false, i);
      this.fx.burst(this.v.set(m.x, 0.6, -m.s), 12, this.L.props.bits[3], { speed: 7, up: 5, size: 0.3 });
    });
    // (a raft under it goes down with a splash)
    for (const f of this.c.rafts) {
      if (f.dead || f.s0 > b || f.s1 < a) continue;
      f.dead = true;
      this.fx.burst(this.v.set(f.x, 0.2, -(f.s0 + f.s1) / 2), 18, ["#ffffff", "#7fe4ff", "#1fa8d8"], { speed: 7, up: 6, size: 0.3 });
    }
    this.c.swings.forEach((sw, i) => {
      if (sw.dead || sw.s > b || sw.s < a) return;
      sw.dead = true;
      this.ballB.put(sw.bx, 0.15, -sw.s, BR * 2.6, 0.3, BR * 2.6, undefined, 0, false, i);
      this.chainB.put(0, -50, -sw.s, 0.01, 0.01, 0.01, undefined, 0, false, i);
      this.ballSh.put(0, -50, -sw.s, 0.01, 0.01, 1, undefined, 0, true, i);
    });
    for (const cr of this.crush)
      if (!cr.dead && cr.s > a && cr.s < b + 0.5) {
        cr.dead = true;
        for (const o of cr.objs) o.visible = false;
        for (let i = 0; i < 5; i++) this.fx.burst(this.v.set((i - 2) * 2, 2 + (i % 2) * 3, -cr.s), 8, cr.colors, { speed: 8, up: 6, size: 0.35 });
      }
    for (const r of this.R) if (r.st === FLAT) r.lands++;
  }

  // ---- the runners -------------------------------------------------------------------------------

  private flatten(r: Run) {
    r.st = FLAT;
    this.goOut(r);
    r.lands = 0;
    r.peel = 0;
    const a = r.a;
    a.out = true;
    if (a.shadow) a.shadow.visible = false;
    if (a.ring) a.ring.visible = false;
    if (a.marker) a.marker.visible = false;
    // stuck to the face that lands on it, as it will lie once down: belly to the road, its head
    // toward the camera (so it stands on the back face a roll later, and lies head-up the screen
    // on the front half of the top one after two, where the camera sees it)
    const qLand = this.qa.setFromAxisAngle(this.v.set(1, 0, 0), -((this.qk + 1) * Math.PI) / 2);
    const inv = qLand.clone().invert();
    const n = this.v.set(0, -1, 0).applyQuaternion(inv);
    const fwd = this.v2.set(0, 0, 1).applyQuaternion(inv);
    const p = new THREE.Vector3(clamp(r.x, -QS / 2 + 1.2, QS / 2 - 1.2) * 0.6, -QS / 2 - 0.05, 0.6).applyQuaternion(inv);
    const xAxis = new THREE.Vector3().crossVectors(fwd, n);
    this.m4.makeBasis(xAxis, fwd, n);
    this.qRot.add(a.root);
    a.root.position.copy(p);
    a.root.quaternion.setFromRotationMatrix(this.m4);
    a.root.scale.set(1.25, 1.25, 0.12);
    a.angry = false;
    this.fx.burst(this.v.set(r.x, 0.4, -r.s), 22, [r.p.color, "#ffffff", GOLD], { speed: 8, up: 4, size: 0.28 });
    splat();
    if (r.p.human) (sfx.lose(), this.cam.shake(0.9), (this.focusQ = 5.2), this.say(T("SQUASHED!", "被压扁了！"), "#ff5a6e", 1.8, 70));
    else this.say(`${short(r.p)} ${T("SQUASHED!", "被压扁！")}`, r.p.color, 1.3, 40);
  }

  private goOut(r: Run) {
    this.note(r, r.st === FLAT ? "flat" : "fall");
    r.out = this.t;
    r.outS = r.s;
    this.outs.push(r);
  }

  /** Off the face once it comes round on top: back to its shape (boing) and flung off the road. */
  private peel(r: Run) {
    const a = r.a;
    this.w.scene.attach(a.root);
    r.st = FLUNG;
    r.peel = 0;
    a.root.getWorldPosition(this.v);
    r.x = this.v.x;
    r.y = this.v.y;
    r.s = -this.v.z;
    r.kx = (r.x >= 0 ? 1 : -1) * (5 + Math.random() * 2);
    r.vy = 10;
    r.vs = -1;
    boing();
    this.fx.burst(this.v.set(r.x, r.y + 0.5, -r.s), 12, ["#ffffff", GOLD], { speed: 5, up: 4, size: 0.25 });
  }

  private startFall(r: Run) {
    r.st = FALL;
    this.goOut(r);
    r.a.out = true;
    r.spin = 0;
    scream();
    this.fx.burst(this.v.set(r.x, -0.4, -r.s), 8, [r.p.color, "#ffffff"], { speed: 3, up: 2.5, size: 0.2, life: 0.6 });
    if (r.p.human) (sfx.lose(), this.say(T("FELL!", "掉下去了！"), "#ff5a6e", 1.8, 70));
    else this.say(`${short(r.p)} ${T("FELL!", "掉下去了！")}`, r.p.color, 1.3, 40);
  }

  private shove(r: Run, dir: number) {
    r.shove = 0.22;
    this.stats.shove++;
    r.shoveDir = dir;
    r.shoveCd = 1.0;
    r.kx = dir * 6.5;
    if (r.p.human || Math.abs(r.s - this.subjectS()) < 12) sfx.whoosh();
  }

  /** The human's or the AI's hands this frame (into cmx/cmy); jumps and shoves are done here. */
  private control(r: Run, dt: number, input: Input) {
    if (r.p.human) {
      if (this.dbg) this.hint(r, dt);
      const inp = inputOf(r.p, input);
      const ax = inp.axis();
      this.cmx = clamp(ax.x * STICK_K, -1, 1);
      this.cmy = clamp(-ax.y * STICK_K, -1, 1);
      if (inp.pressed("a")) r.buf = BUFFER;
      if (inp.pressed("b") && r.shoveCd <= 0 && r.stun <= 0) {
        // (a stick that leans a hair to a side while running is not a choice of side: the nearest rival is)
        let dir = Math.abs(ax.x) > 0.35 ? Math.sign(ax.x) : 0;
        if (!dir) {
          let best = 2.6;
          for (const o of this.R)
            if (o !== r && o.st === RUN && Math.abs(o.s - r.s) < 1.6 && Math.abs(o.x - r.x) < best) {
              best = Math.abs(o.x - r.x);
              dir = Math.sign(o.x - r.x) || 1;
            }
        }
        this.shove(r, dir || r.lat);
      }
      return;
    }
    this.think(r, dt);
  }

  /** What a good runner would do in the visitor's place (for a scripted test): window.__rollHint. */
  private hint(r: Run, dt: number) {
    const keep = r.buf;
    r.ai = this.hintAI ??= { tx: r.x, slow: false, stuckCd: 0, next: 0, err: 0, hz: 0, hes: false, stuck: 0, swing: -1, wait: false, gust: 0, brace: false, raft: null, rerr: 0, rush: false };
    r.buf = 0;
    this.think(r, dt);
    const jump = r.buf > 0;
    if (jump) this.hintN++;
    (window as unknown as Record<string, unknown>).__rollHint = { mx: this.cmx, my: this.cmy, jump, n: this.hintN };
    r.ai = null;
    r.buf = keep;
  }

  private think(r: Run, dt: number) {
    const ai = r.ai!;
    const sk = r.p.human ? 0.92 : r.p.skill;
    this.cmy = 1;
    // stuck on a wall: a poor runner keeps pushing a while
    ai.stuckCd -= dt;
    if (r.front && ai.stuck <= 0 && ai.stuckCd <= 0 && r.grounded) {
      const lim = (0.2 + this.rnd() * 1.4) * Math.pow(1 - sk, 1.6);
      ai.stuckCd = lim + 1.5;
      if (lim > 0.06) ai.stuck = lim;
    }
    if (ai.stuck > 0) {
      ai.stuck -= dt;
      this.cmx = 0;
      if (ai.stuck <= 0) ai.next = 0;
      return;
    }
    ai.next -= dt;
    // (a pool ahead or under it: the rafts take over its line and its jumps)
    const raft = this.c.rafts.length > 0 && this.raftThink(r, sk);
    if (!raft && ai.next <= 0) this.plan(r);
    const dx = ai.tx - r.x;
    this.cmx = Math.abs(dx) < 0.08 ? 0 : clamp(dx * 2.4, -1, 1);
    if (ai.slow && Math.abs(dx) > 0.4 && !raft) this.cmy = 0.35 + 0.25 * (1 - sk);
    // a gust: the steady ones lean into it (the others drift)
    if (this.gPhase > 0) {
      if (ai.gust !== this.gN) ((ai.gust = this.gN), (ai.brace = this.rnd() < 0.2 + 0.8 * sk));
      if (ai.brace && this.gk > 0) {
        const ice = r.grounded && this.iceG.has(r.s, r.x, 0) ? 1.5 : 1;
        this.cmx = clamp(this.cmx - this.gDir * this.gk * (GUST / VL) * ice * 1.15, -1, 1);
      }
    }
    // the next gap or bar on its line: when to jump
    if (r.grounded && !raft) {
      const L = Math.max(3, r.vs) * AIR;
      let target = Infinity,
        key = 0,
        edge = -1;
      for (let d = 0; d <= 6; d += 0.2)
        if (!this.floorAt(r.s + d, r.x)) {
          edge = r.s + d;
          break;
        }
      if (edge >= 0) {
        const back = this.landing(edge, r.x) || 3.6;
        target = edge - clamp((L - back) / 2, 0.25, 2.2);
        key = Math.round(edge * 4) + 1;
      }
      for (let c = cellOf(r.s); c <= cellOf(r.s + 6); c++)
        for (const o of this.sol.cell(c))
          if (o.kind === BAR && !o.dead && o.s0 > r.s && r.x > o.x0 - RB && r.x < o.x1 + RB) {
            const bt = o.s0 - (L / 2 - 0.25);
            if (bt < target) ((target = bt), (key = -Math.round(o.s0 * 4) - 1));
          }
      if (key !== ai.hz) {
        ai.hz = key;
        const gauss = (this.rnd() + this.rnd() + this.rnd() - 1.5) * 2;
        ai.err = 0.55 * (1 - sk) + gauss * 1.6 * Math.pow(1 - sk, 1.2);
        ai.hes = this.rnd() < 0.25 * (1 - sk) * (1 - sk);
      }
      if (key && ai.hes && target - r.s < 3) this.cmy = 0.55;
      if (key && r.s >= target + ai.err) r.buf = BUFFER;
      // panic, with the Q right behind
      if (sk < 0.6 && r.s - this.qf < QS + 1.5 && this.rnd() < dt * 1.2 * (1 - sk)) r.buf = BUFFER;
    }
    // a swinging ball ahead: the good ones wait for it to pass
    for (let i = 0; i < this.c.swings.length; i++) {
      const sw = this.c.swings[i];
      const d = sw.s - r.s;
      if (sw.dead || d < 0.3 || d > 5) continue;
      if (ai.swing !== i) ((ai.swing = i), (ai.wait = this.rnd() < 0.15 + 0.85 * sk));
      // (not with the Q right behind: then it is go anyway)
      if (!ai.wait || r.s - this.qf < QS + 2.5) continue;
      // would it be under the ball while it crosses, setting off now?
      const vg = Math.max(5.5, r.vs);
      const t0 = Math.max(0, d - BR - RB - 0.3) / vg,
        t1 = (d + BR + RB + 0.3) / vg;
      let hit = false;
      for (let k = 0; k <= 5 && !hit; k++) {
        const ang = sw.amp * Math.sin(sw.om * (this.it + t0 + ((t1 - t0) * k) / 5) + sw.ph);
        if (PY - SL * Math.cos(ang) < 2.9 && Math.abs(SL * Math.sin(ang) - r.x) < BR + RB + 0.5) hit = true;
      }
      if (hit) this.cmy = d < BR + RB + 1.2 ? 0 : 0.3;
    }
    // a shove at the edge
    if (sk > 0.4 && !r.p.human && r.shoveCd <= 0 && r.grounded && r.stun <= 0)
      for (const o of this.R) {
        if (o === r || o.st !== RUN || !o.grounded) continue;
        const ds = o.s - r.s,
          dx = o.x - r.x;
        if (Math.abs(ds) > 0.9 || Math.abs(dx) < 0.45 || Math.abs(dx) > 1.7) continue;
        if (o.p.human && this.t < 6) continue;
        const dir = Math.sign(dx);
        // (a real drop beside the rival: not the kerb)
        const edgy = (Math.abs(o.x + dir * 1.4) < HALF && !this.floorAt(o.s + 1, o.x + dir * 1.4, 0)) || (Math.abs(o.x + dir * 1.1) < HALF && !this.floorAt(o.s + 0.3, o.x + dir * 1.1, 0));
        const p = (edgy ? 3.2 : 0.3) * sk * (o.p.human ? 0.75 : 1);
        if (this.rnd() < p * dt) {
          this.shove(r, dir);
          r.shoveCd = 1.6 + 2.5 * (1 - sk);
          break;
        }
      }
  }

  /**
   * A rooftop pool: meet the next raft. Its line goes where the raft will be when it lands (misjudged
   * by the poor ones); not lined up at the jump point, it waits (the poor ones, or anyone with the Q
   * at their heels, sometimes just go). Riding a raft, it keeps to the middle of it. Returns whether
   * the pool is in charge (no plan(), no generic jumps).
   */
  private raftThink(r: Run, sk: number) {
    const ai = r.ai!;
    let pool: Rect | null = null;
    for (const p of this.c.pools) if (r.s > p.s0 - 6.5 && r.s < p.s1 - 0.2) ((pool = p), 0);
    if (!pool) {
      ai.raft = null;
      return false;
    }
    // in the air: steer for the raft it jumped at
    if (!r.grounded) {
      if (ai.raft && !ai.raft.dead) {
        const tl = Math.max(0.05, (r.vy + Math.sqrt(Math.max(0, r.vy * r.vy + 2 * G * Math.max(0, r.y)))) / G);
        ai.tx = clamp(this.raftX(ai.raft, this.it + tl) + ai.rerr * 0.5, -LIM, LIM);
      }
      return true;
    }
    const on = this.raftAt(r.s, r.x, 0.12);
    const edge = on ? on.s1 : r.s < pool.s0 ? pool.s0 : -1;
    if (edge < 0) return false;
    // (boosted, a jump would sail over the raft: ease off to a run)
    if (r.boost > 0) this.cmy = Math.min(this.cmy, V / BOOST_V);
    // what is beyond the edge: the next raft, or the far deck
    let tgt: Raft | null = null;
    for (const f of this.c.rafts) if (!f.dead && f.s0 >= edge - 0.01 && f.s0 < edge + 3.7) ((tgt = f), 0);
    const back = tgt ? tgt.s0 - edge : this.landing(edge, 0) || 1.3;
    const L = Math.max(3, r.vs) * AIR;
    const jumpAt = edge - clamp((L - back) / 2, 0.25, 2.2);
    if (!tgt) {
      // to the far deck: stay on the raft, jump at the jump point
      if (on) ai.tx = clamp(on.x + on.vx * 0.15, -LIM, LIM);
      if (r.s >= jumpAt + ai.err * 0.5) ((r.buf = BUFFER), (ai.raft = null));
      return true;
    }
    if (ai.raft !== tgt) {
      ai.raft = tgt;
      const gauss = (this.rnd() + this.rnd() + this.rnd() - 1.5) * 2;
      ai.rerr = gauss * 1.5 * Math.pow(1 - sk, 1.3);
      ai.rush = this.rnd() < 0.45 * (1 - sk) * (1 - sk);
    }
    // where the raft will be as it lands
    const tl = Math.max(0, jumpAt - r.s) / Math.max(r.vs, 3.5) + AIR * 0.8;
    const fx = this.raftX(tgt, this.it + tl) + ai.rerr;
    let want = fx;
    if (on) {
      // (it can only go where its own raft is)
      const ox = this.raftX(on, this.it + Math.min(tl, 0.4));
      want = clamp(fx, ox - on.w / 2 + 0.45, ox + on.w / 2 - 0.45);
    }
    ai.tx = clamp(want, -LIM, LIM);
    const lined = Math.abs(fx - ai.tx) < tgt.w / 2 - 0.35 && Math.abs(r.x - ai.tx) < 0.8;
    const hurry = r.s - this.qf < QS + 2.5 && this.rnd() < 0.5 * (1 - sk * 0.5);
    if (lined || ai.rush || hurry) {
      if (r.s >= jumpAt + ai.err * 0.5) {
        r.buf = BUFFER;
        this.stats.raftJump++;
      }
    } else {
      // wait a step back from the jump point (on a raft: just stand)
      const hold = jumpAt - 1.1;
      this.cmy = on ? 0 : r.s < hold - 1.2 ? 1 : r.s < hold ? 0.25 : 0;
    }
    return true;
  }

  /** Choose its line: a lane across the road, from what it can see ahead. */
  private plan(r: Run) {
    const ai = r.ai!;
    const sk = r.p.human ? 0.92 : r.p.skill;
    const look = 4.5 + 10 * sk;
    // (a gust coming or blowing: the good ones keep away from a drop downwind)
    const gusty = this.gPhase > 0 ? this.gDir * sk : 0;
    // (on ice a sidestep takes longer: the good ones start it sooner)
    const iceK = this.c.ices.length && this.iceG.has(r.s + 2, r.x, 1) ? 1 + 0.9 * sk : 1;
    let best = ai.tx,
      bestC = Infinity,
      bestSlow = false;
    for (let li = 0; li < 19; li++) {
      const xc = -3.6 + li * 0.4;
      let c = Math.abs(xc - r.x) * 0.22 + this.rnd() * 1.6 * (1 - sk) * (1 - sk);
      const reach = Math.max(0.5, (Math.abs(xc - r.x) / VL) * V * iceK);
      let jumpable = false,
        slow = false;
      for (let k = 0; k < 24; k++) {
        const d = 0.4 + k * 0.6;
        if (d > look) break;
        const ss = r.s + d;
        const moving = d < reach;
        const xe = r.x + (xc - r.x) * Math.min(1, d / reach);
        const w = 1 / (1 + 0.1 * k);
        // (blocked on the lane itself: a dead end; only on the way across: a bump)
        const ta = this.it + d / V;
        if (this.blockedAt(ss, xc, ta)) {
          c += 9 * w;
          break;
        }
        if (moving && this.blockedAt(ss, xe, ta)) ((c += 1.5 * w), (slow = true));
        if (!this.floorAt(ss, xe, 0.12, ta)) {
          if (!jumpable && !moving && this.landing(ss, xe, ta) > 0) jumpable = true;
          if (jumpable) c += 0.7 * w;
          else {
            c += 9 * w;
            break;
          }
        } else {
          jumpable = false;
          if (!this.floorAt(ss, xe - 0.35, 0, ta) || !this.floorAt(ss, xe + 0.35, 0, ta)) c += 1.1 * w;
          if (gusty) {
            const xd = xe + Math.sign(gusty) * 1.4;
            if (Math.abs(xd) < HALF && !this.ground(ss, xd)) c += 1.6 * w * Math.abs(gusty);
          }
        }
        if (this.beltG.has(ss, xe)) c += 0.35 * w;
        if (sk > 0.35 && this.padG.has(ss, xe)) c -= 1.4 * w;
      }
      for (const o of this.R) if (o !== r && (o.st === RUN || o.st === CLIMB) && o.s > r.s - 0.5 && o.s < r.s + 4 && Math.abs(o.x - xc) < 0.9) c += 0.5;
      if (c < bestC) ((bestC = c), (best = xc), (bestSlow = slow));
    }
    ai.tx = best;
    // (the good ones ease off for a sidestep; the poor ones barge on)
    ai.slow = bestSlow && this.rnd() < 0.3 + 0.7 * sk;
    ai.next = 0.1 + 0.45 * (1 - sk) * (0.6 + 0.8 * this.rnd());
  }

  /** A box in the way (a crate, a wall, a bar, a sliding block): out of it, and what it does. */
  private box(r: Run, s0: number, s1: number, x0: number, x1: number, h: number, kind: number, mvx: number) {
    if (r.y >= h - 0.02) return;
    const cs = clamp(r.s, s0, s1),
      cx = clamp(r.x, x0, x1);
    const ds = r.s - cs,
      dx = r.x - cx;
    const d2 = ds * ds + dx * dx;
    if (d2 >= RB * RB) return;
    let ns = 0,
      nx = 0,
      pen = 0;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      ns = ds / d;
      nx = dx / d;
      pen = RB - d;
    } else {
      const a = r.s - s0 + RB,
        b = s1 - r.s + RB,
        c = r.x - x0 + RB,
        e = x1 - r.x + RB;
      const m = Math.min(a, b, c, e);
      if (m === a) ((ns = -1), (pen = a));
      else if (m === b) ((ns = 1), (pen = b));
      else if (m === c) ((nx = -1), (pen = c));
      else ((nx = 1), (pen = e));
    }
    r.s += ns * pen;
    r.x += nx * pen;
    if (ns < -0.6) {
      // into its near face
      r.front = true;
      const fast = r.vs > 4.2 && r.bonkCd <= 0;
      if (kind === BAR && r.vs > 1.5 && r.bonkCd <= 0) (this.knock(r, 0.85, -2.6, true), this.stats.trip++, this.note(r, "trip"));
      else if (fast) (this.knock(r, 0.5, -3.6, false), this.stats.bonk++, this.note(r, "bonk"));
      else r.vs = Math.min(r.vs, 0);
    } else if (ns > 0.6) r.vs = Math.max(r.vs, 0);
    if (Math.abs(nx) > 0.5) {
      if (mvx * nx > 0.5 && r.bonkCd <= 0) {
        // a sliding block shoves it aside
        r.kx = nx * (Math.abs(mvx) + 4.5);
        r.stun = Math.max(r.stun, 0.35);
        r.bonkCd = 0.6;
        this.stats.moverHit++;
        r.a.hit();
        if (r.p.human || Math.abs(r.s - this.subjectS()) < 14) sfx.hit();
        this.fx.burst(this.v.set(r.x - nx * 0.4, 1, -r.s), 8, ["#ffffff", "#8f89ff"], { speed: 4, up: 3, size: 0.22 });
      }
      if (r.vx * nx < 0) r.vx = 0;
      if (r.kx * nx < 0) r.kx = 0;
    }
  }

  /** A bonk (on a wall) or a trip (on a bar): dazed a moment, thrown back. */
  private knock(r: Run, stun: number, back: number, trip: boolean) {
    r.stun = Math.max(r.stun, stun);
    r.vs = back;
    r.bonkCd = 1.1;
    r.boost = 0;
    r.a.hit();
    if (trip) (r.vy = 3.5, (r.grounded = false));
    const near = r.p.human || Math.abs(r.s - this.subjectS()) < 14;
    if (near) sfx.hit();
    if (r.p.human) this.cam.shake(0.25);
    this.fx.burst(this.v.set(r.x, 1.6 * MS, -r.s), 10, [GOLD, "#ffffff"], { speed: 3, up: 3, size: 0.2, gravity: 4 });
  }

  private step(r: Run, dt: number, input: Input) {
    const a = r.a;
    r.stun = Math.max(0, r.stun - dt);
    r.bonkCd = Math.max(0, r.bonkCd - dt);
    r.boost = Math.max(0, r.boost - dt);
    r.shove = Math.max(0, r.shove - dt);
    r.shoveCd = Math.max(0, r.shoveCd - dt);
    r.buf = Math.max(0, r.buf - dt);
    r.angry = Math.max(0, r.angry - dt);
    if (r.angry <= 0 && a.body.puppet.motion.angry) a.angry = false;
    if (r.st === CLIMB) {
      // hanging on the far edge, then up
      r.climb += dt;
      const k = clamp((r.climb - 0.3) / 0.22, 0, 1);
      r.y = -1.0 * MS + k * (1.0 * MS + 0.3);
      r.s = r.edge - 0.3 + k * 0.6;
      r.vs = 0;
      // (hanging from a raft: carried along with it)
      if (r.on) r.x = clamp(r.x + r.on.vx * dt, -LIM, LIM);
      if (r.climb >= 0.52) {
        r.on = null;
        r.st = RUN;
        r.y = 0.3;
        r.vy = 2;
        r.grounded = false;
        r.vs = 3;
        a.body.jump();
      }
      a.legs = 2;
      a.pos.set(r.x, r.y, -r.s);
      a.floor = r.y > -0.3 ? 0 : null;
      a.vy = 0;
      a.grounded = false;
      a.face(Math.PI, dt);
      a.sync(dt);
      return;
    }
    this.cmx = 0;
    this.cmy = 0;
    if (r.st === RUN) this.control(r, dt, input);
    if (r.stun > 0) ((this.cmx = 0), (this.cmy = 0));
    const sk = r.ai ? r.p.skill : 1;
    const top = (r.boost > 0 ? BOOST_V : V) * (r.ai ? 0.94 + 0.06 * sk : 1);
    const tvs = this.cmy > 0 ? top * this.cmy : this.cmy < 0 ? -VB : 0;
    // (on ice: little grip, forward or sideways, and a shove slides on and on)
    const ice = r.grounded && this.c.ices.length > 0 && this.iceG.has(r.s, r.x, 0) !== null;
    const acc = r.grounded ? (tvs > r.vs ? 24 : 30) * (ice ? ICE_F : 1) : 8;
    r.vs += clamp(tvs - r.vs, -acc * dt, acc * dt);
    const tvx = this.cmx * VL;
    const lacc = (r.grounded ? 44 * (ice ? ICE_L : 1) : 22) * dt;
    r.vx += clamp(tvx - r.vx, -lacc, lacc);
    if (this.cmx) r.lat = Math.sign(this.cmx);
    r.kx *= Math.exp(-(ice ? ICE_K : 5) * dt);
    const ps = r.s,
      px = r.x,
      py = r.y;
    r.s += r.vs * dt;
    r.x += (r.vx + r.kx) * dt;
    // a gust pushes everyone sideways (more on ice, less in the air)
    if (this.gk > 0) r.x += this.gDir * GUST * this.gk * (ice ? 1.5 : r.grounded ? 1 : 0.7) * dt;
    // a raft carries whoever stands on it
    if (r.grounded && this.c.rafts.length) {
      const f = this.raftAt(r.s, r.x, 0.05);
      if (f) r.x += f.vx * dt;
    }
    // (skates squeal: shavings off the ice in a hard turn)
    if (ice && Math.abs(tvx - r.vx) > 3 && this.drnd() < 0.3) this.fx.burst(this.v.set(r.x, 0.1, -r.s), 1, ["#ffffff", "#c8f0ff"], { speed: 2, up: 1.5, size: 0.14, life: 0.4 });
    if (r.grounded && this.beltG.has(r.s, r.x, 0)) r.s += BELT * dt;
    if (r.grounded && r.boost < BOOST_T - 0.25 && this.padG.has(r.s, r.x, 0)) {
      r.boost = BOOST_T;
      this.stats.boost++;
      r.vs = Math.max(r.vs, BOOST_V * 0.9);
      if (r.p.human) zip();
      this.fx.burst(this.v.set(r.x, 0.3, -r.s), 10, ["#b6ffd2", "#3dff8a", "#ffffff"], { speed: 3, up: 4, size: 0.2 });
    }
    // the boxes, the sliding blocks, the kerbs
    r.front = false;
    for (let c = cellOf(r.s - 1); c <= cellOf(r.s + 1); c++) for (const o of this.sol.cell(c)) if (!o.dead) this.box(r, o.s0, o.s1, o.x0, o.x1, o.h, o.kind, 0);
    for (const m of this.c.movers) if (!m.dead && Math.abs(m.s - r.s) < 1.5) this.box(r, m.s - m.d / 2, m.s + m.d / 2, m.x - m.w / 2, m.x + m.w / 2, m.h, WALL, m.vx);
    if (Math.abs(r.x) > LIM) {
      r.x = clamp(r.x, -LIM, LIM);
      if (r.kx * r.x > 0) r.kx = 0;
      if (r.vx * r.x > 0) r.vx = 0;
      // (pinned against the kerb by a sliding block: squeezed out backward)
      for (const m of this.c.movers)
        if (!m.dead && Math.abs(m.s - r.s) < m.d / 2 + RB && Math.abs(m.x - r.x) < m.w / 2 + RB - 0.05 && r.y < m.h) {
          r.s = m.s - m.d / 2 - RB;
          r.vs = Math.min(r.vs, 0);
        }
    }
    // the swinging balls
    for (const sw of this.c.swings) {
      if (sw.dead || Math.abs(sw.s - r.s) > BR + RB + 0.3 || r.bonkCd > 0) continue;
      const dx = r.x - sw.bx,
        dy = r.y + 0.9 - sw.by,
        ds = r.s - sw.s;
      if (dx * dx + dy * dy + ds * ds < (BR + RB + 0.1) ** 2) {
        const dir = Math.abs(sw.bvx) > 1 ? Math.sign(sw.bvx) : Math.sign(dx) || 1;
        r.kx = dir * 9;
        r.vy = 6;
        r.grounded = false;
        r.vs *= 0.3;
        r.stun = 0.75;
        r.bonkCd = 0.8;
        this.stats.swingHit++;
        a.hit();
        if (r.p.human || Math.abs(r.s - this.subjectS()) < 14) sfx.hit();
        if (r.p.human) this.cam.shake(0.35);
        this.fx.burst(this.v.set(r.x, 1.2, -r.s), 14, ["#ff3d5a", "#ffffff", GOLD], { speed: 6, up: 4, size: 0.25 });
      }
    }
    // the Q's front face: no walking back into it
    const qmin = this.qf + RB;
    if (r.s < qmin && this.qu < REST) ((r.s = qmin), (r.vs = Math.max(0, r.vs)));
    // the ground, the air, the gaps
    if (r.grounded) {
      if (this.floorAt(r.s, r.x)) r.coyote = COYOTE;
      else {
        r.coyote -= dt;
        if (r.coyote <= 0) ((r.grounded = false), (r.vy = 0));
      }
    }
    if (r.buf > 0 && r.grounded && r.stun <= 0 && r.st === RUN) {
      r.vy = JV;
      r.grounded = false;
      r.coyote = 0;
      r.buf = 0;
      a.body.jump();
      if (r.p.human) hop();
      this.fx.burst(this.v.set(r.x, 0.1, -r.s), 4, this.L.props.dust, { speed: 2, up: 1.2, size: 0.16, life: 0.4 });
    }
    if (!r.grounded) {
      r.vy -= G * dt;
      // (the fall's own half step, so a short frame or a long one draws the same arc)
      r.y += (r.vy + 0.5 * G * (dt - H0)) * dt;
      if (r.y < -0.12 && this.ground(r.s, r.x)) {
        // (below the road: the cut face of a slab holds it back)
        if (!this.ground(ps, r.x)) ((r.s = ps), (r.vs = Math.min(0, r.vs)));
        if (this.ground(r.s, r.x)) ((r.x = px), (r.vx = 0), (r.kx = 0));
      }
      if (r.vy <= 0 && r.y <= 0 && (py >= -0.05 || r.y > -0.45) && this.floorAt(r.s, r.x)) {
        a.body.land(Math.min(8, -r.vy));
        // (a puff where it lands: grit off the road, spray off a raft)
        if (-r.vy > 5) {
          const wet = this.c.rafts.length > 0 && !this.ground(r.s, r.x);
          this.fx.burst(this.v.set(r.x, 0.12, -r.s), wet ? 9 : 6, wet ? ["#ffffff", "#9ff0ff", "#3ec6ff"] : this.L.props.dust, { speed: wet ? 3.5 : 2.6, up: wet ? 3 : 1.5, size: 0.17, life: 0.45 });
        }
        r.y = 0;
        r.vy = 0;
        r.grounded = true;
        r.coyote = COYOTE;
        if (r.buf > 0 && r.stun <= 0 && r.st === RUN) {
          r.vy = JV;
          r.grounded = false;
          r.buf = 0;
          a.body.jump();
          if (r.p.human) hop();
        }
      } else if (r.st === RUN && r.vy < 0 && r.y < -0.1 && r.y > -0.75 && r.vs > -0.5 && !this.floorAt(r.s, r.x, 0)) {
        // a ledge to catch, just ahead
        for (let d = 0.1; d <= 0.6; d += 0.1)
          if (this.floorAt(r.s + d, r.x, 0)) {
            r.st = CLIMB;
            r.on = this.ground(r.s + d, r.x) ? null : this.raftAt(r.s + d, r.x, 0);
            this.stats.catch++;
            this.note(r, "catch");
            r.climb = 0;
            r.edge = r.s + d;
            r.y = -1.0 * MS;
            r.vs = 0;
            r.kx = 0;
            r.vx = 0;
            a.hit();
            if (r.p.human) sfx.blip(3);
            this.fx.burst(this.v.set(r.x, 0.05, -r.edge), 7, this.L.props.dust, { speed: 2.5, up: 2, size: 0.18, life: 0.5 });
            break;
          }
      }
      if (r.st === RUN && r.y < -1.1) this.startFall(r);
    }
    // (a boost leaves a trail of sparks)
    if (r.boost > 0 && this.drnd() < 0.6) this.fx.burst(this.v.set(r.x, 0.25 + r.y, -r.s + 0.3), 1, ["#b6ffd2", "#ffffff", "#3dff8a"], { speed: 1, up: 1, size: 0.2, life: 0.35, gravity: 0, dir: this.v2.set(0, 0, 4) });
    // the pose
    a.pos.set(r.x, r.y, -r.s);
    a.grounded = r.grounded;
    a.vy = r.vy;
    a.floor = this.floorAt(r.s, r.x, 0) && r.y > -0.3 ? 0 : null;
    const mvx = r.vx + r.kx;
    const sp = Math.hypot(mvx, r.vs);
    a.legs = r.grounded ? sp / MS : null;
    if (r.stun > 0 && r.grounded) a.legs = 0;
    if (sp > 0.6) a.face(yawOf(mvx, -Math.max(r.vs, 0.2)), dt, r.shove > 0 ? 20 : 12);
    else a.face(Math.PI, dt, 6);
    a.sync(dt);
  }

  /** Runners bump each other; a shove sends the one it hits flying sideways. */
  private bumps(dt: number) {
    const R = this.R;
    for (let i = 0; i < 4; i++)
      for (let j = i + 1; j < 4; j++) {
        const A = R[i],
          B = R[j];
        if ((A.st !== RUN && A.st !== CLIMB) || (B.st !== RUN && B.st !== CLIMB) || Math.abs(A.y - B.y) > 1.2) continue;
        const ds = B.s - A.s,
          dx = B.x - A.x;
        const d2 = ds * ds + dx * dx;
        if (d2 > 0.64 || d2 < 1e-8) continue;
        const d = Math.sqrt(d2);
        const ns = ds / d,
          nx = dx / d;
        const push = (0.8 - d) / 2;
        A.s -= ns * push;
        A.x -= nx * push;
        B.s += ns * push;
        B.x += nx * push;
        if (Math.abs(nx) > 0.35) (this.shoveHit(A, B, Math.sign(nx)), this.shoveHit(B, A, -Math.sign(nx)));
        if (Math.abs(nx) > 0.3) {
          // (a push per second, not per frame: two that lean on each other part as fast on any screen)
          A.kx -= nx * 48 * dt;
          B.kx += nx * 48 * dt;
        }
      }
  }

  /** S's shove lands on O (if S is shoving that way). */
  private shoveHit(S: Run, O: Run, dir: number) {
    if (S.shove <= 0 || S.shoveDir !== dir) return;
    O.kx = dir * 8.5 * (O.p.human ? 0.85 : 1);
    O.stun = Math.max(O.stun, 0.4);
    this.stats.shoveHit++;
    O.vs *= 0.85;
    O.a.hit();
    O.a.angry = true;
    O.angry = 1.5;
    S.shove = 0;
    S.kx *= 0.3;
    this.note(O, `shoved by #${S.i}`);
    const near = S.p.human || O.p.human;
    if (near) this.cam.shake(0.2);
    if (near || Math.abs(S.s - this.subjectS()) < 14) sfx.hit();
    this.fx.burst(this.v.set((S.x + O.x) / 2, 1, -(S.s + O.s) / 2), 12, [S.p.color, "#ffffff"], { speed: 5, up: 3, size: 0.22 });
  }

  /** The finished: on to their spot past the arch, then turned round to cheer. */
  private stepDone(r: Run, dt: number) {
    const a = r.a;
    const ts = this.c.fin + 6 + r.place * 1.6;
    const tx = [-0.9, 0.9, -2.6, 2.6][r.place] ?? 0;
    const ds = ts - r.s;
    r.vs = clamp(ds * 2.2, 0, V);
    r.s += r.vs * dt;
    r.x += clamp(tx - r.x, -1, 1) * 3 * dt;
    if (!r.grounded) {
      r.vy -= G * dt;
      r.y += r.vy * dt;
      if (r.y <= 0) ((r.y = 0), (r.vy = 0), (r.grounded = true), a.body.land(3));
    }
    a.pos.set(r.x, r.y, -r.s);
    a.grounded = r.grounded;
    a.vy = r.vy;
    a.floor = 0;
    a.legs = r.vs / MS;
    if (ds > 0.6) a.face(Math.PI, dt);
    else {
      a.face(0, dt, 5);
      r.cheer -= dt;
      if (r.cheer <= 0) ((r.cheer = 2.4), a.cheer(2));
    }
    a.sync(dt);
  }

  private stepOut(r: Run, dt: number) {
    const a = r.a;
    if (r.st === FALL) {
      r.vy -= G * dt;
      r.y += r.vy * dt;
      r.s += r.vs * dt * 0.6;
      r.x += r.kx * dt;
      r.spin += dt;
      a.pos.set(r.x, r.y, -r.s);
      a.floor = null;
      a.grounded = false;
      a.vy = r.vy;
      a.legs = 6;
      a.sync(dt);
      a.root.rotation.x = r.spin * 5;
      a.root.rotation.z = r.spin * 3;
      this.sink(r);
    } else if (r.st === FLAT) {
      // its face comes round on top two rolls after the one that flattened it: then it peels off
      if (r.lands >= 3) {
        r.peel += dt;
        if (r.peel > 0.55) this.peel(r);
      }
    } else if (r.st === FLUNG) {
      r.peel += dt;
      r.vy -= G * 0.7 * dt;
      r.y += r.vy * dt;
      r.x += r.kx * dt;
      r.s += r.vs * dt;
      const k = clamp(r.peel / 0.45, 0, 1);
      const wob = 1 + Math.sin(r.peel * 26) * 0.25 * (1 - k);
      a.root.scale.set(1.25 - 0.25 * k, (1.25 - 0.25 * k) * wob, 0.12 + 0.88 * k);
      a.root.position.set(r.x, r.y, -r.s);
      a.root.rotateY(dt * 9);
      a.root.rotateX(dt * 4);
      a.body.update(dt, { speed: 0, grounded: false, vy: r.vy });
      this.sink(r);
    }
  }

  /** The water under (s, x), if any: a pool's, or the level's (the river). */
  private waterAt(s: number, x: number) {
    if (this.c.pools.length && Math.abs(x) < HALF + 0.5 && this.poolG.has(s, x, 0.2)) return POOL_Y;
    return this.L.waterY ?? null;
  }
  /** A fall ends: a splash in the water (and under), or out of sight far below. */
  private sink(r: Run) {
    const a = r.a;
    if (!a.root.visible) return;
    const wy = this.waterAt(r.s, r.x);
    if (wy !== null && !r.splash && r.y < wy) {
      r.splash = true;
      this.stats.splash++;
      r.vy = Math.max(r.vy, -2.2);
      r.kx *= 0.2;
      r.vs *= 0.2;
      this.fx.burst(this.v.set(r.x, wy + 0.1, -r.s), 26, ["#ffffff", "#bff0ff", "#5ac8f0"], { speed: 6, up: 7, size: 0.28, life: 1 });
      if (r.p.human || Math.abs(r.s - this.subjectS()) < 20) splash();
      if (r.p.human) this.cam.shake(0.3);
    }
    const sideY = this.L.sideY;
    if ((wy !== null && r.y < wy - 1.8) || r.y < this.L.deep || (sideY !== undefined && Math.abs(r.x) > HALF + 2.2 && r.y < sideY)) a.root.visible = false;
  }

  // ---- the frame ---------------------------------------------------------------------------------

  private animProps(dt: number) {
    const t = this.it;
    // the sliding blocks and the swinging balls (from the clock: the AI reads ahead with it)
    this.c.movers.forEach((m, i) => {
      if (m.dead) return;
      const nx = this.moverX(m, this.it);
      m.vx = dt > 0 ? (nx - m.x) / dt : 0;
      m.x = nx;
      this.moverB.put(m.x, m.h / 2, -m.s, m.w, m.h, m.d, undefined, 0, false, i);
    });
    this.c.swings.forEach((sw, i) => {
      if (sw.dead) return;
      const a = sw.amp * Math.sin(sw.om * this.it + sw.ph);
      const nbx = SL * Math.sin(a);
      sw.bvx = dt > 0 ? (nbx - sw.bx) / dt : 0;
      sw.a = a;
      sw.bx = nbx;
      sw.by = PY - SL * Math.cos(a);
      this.ballB.put(sw.bx, sw.by, -sw.s, BR * 2, BR * 2, BR * 2, undefined, 0, false, i);
      const sh = 2.4 - (sw.by - 1) * 0.15;
      this.ballSh.put(sw.bx, 0.03, -sw.s, sh, sh, 1, undefined, 0, true, i);
    });
    this.chainTilt();
    // the rafts glide (from the clock too); a sunk one goes down
    if (this.raftB && this.raftTop) {
      const rb = this.raftB,
        rt = this.raftTop;
      this.c.rafts.forEach((f, i) => {
        const sc = (f.s0 + f.s1) / 2,
          d = f.s1 - f.s0;
        if (f.dead) {
          if (f.sink > 1.2) return;
          f.sink += dt;
          const y = -0.3 - f.sink * 1.4;
          rb.put(f.x, y, -sc, f.w, 0.56, d, undefined, 0, false, i);
          rt.put(f.x, y + 0.3, -sc, f.w - 0.5, 0.06, d - 0.5, undefined, 0, false, i * 2);
          rt.put(f.x, y + 0.32, -sc, f.w - 0.9, 0.06, d - 0.9, undefined, 0, false, i * 2 + 1);
          return;
        }
        f.x = this.raftX(f, this.it);
        f.vx = f.amp * f.om * Math.cos(f.om * this.it + f.ph);
        const bob = Math.sin(t * 2.2 + i) * 0.025;
        rb.put(f.x, -0.3 + bob, -sc, f.w, 0.56, d, undefined, 0, false, i);
        rt.put(f.x, bob, -sc, f.w - 0.5, 0.06, d - 0.5, undefined, 0, false, i * 2);
        rt.put(f.x, 0.02 + bob, -sc, f.w - 0.9, 0.06, d - 0.9, undefined, 0, false, i * 2 + 1);
      });
    }
    if (this.poolTex) ((this.poolTex.offset.x = (this.poolTex.offset.x + dt * 0.05) % 1), (this.poolTex.offset.y = (this.poolTex.offset.y + dt * 0.08) % 1));
    // the flags ripple on their poles; in a gust they swing round and stream out downwind
    const wk = this.gk > 0 ? this.gk : this.gPhase === 1 ? 0.35 : 0;
    for (let i = 0; i < this.flagSpots.length; i++) {
      const f = this.flagSpots[i];
      // (the way it hangs: out from the road, turned toward the wind's way by as much as it blows)
      const rest = f.side > 0 ? 0 : Math.PI;
      const down = this.gDir > 0 ? 0 : Math.PI;
      const th = rest + (down - rest) * wk;
      const sp = 5 + wk * 12,
        amp = 0.22 + wk * 0.2;
      const a1 = th + Math.sin(t * sp + i * 1.7) * amp,
        a2 = th + Math.sin(t * sp + i * 1.7 - 1.2) * amp * 1.9;
      const c1 = Math.cos(a1),
        s1 = Math.sin(a1);
      this.flagB.put(f.x + c1 * 0.26, f.y, -f.s - s1 * 0.26, 0.52, 0.7, 0.06, undefined, a1, false, i * 2);
      this.flagB.put(f.x + c1 * 0.5 + Math.cos(a2) * 0.26, f.y, -f.s - s1 * 0.5 - Math.sin(a2) * 0.26, 0.54, 0.7, 0.06, undefined, a2, false, i * 2 + 1);
    }
    this.beltTex.offset.y = (this.beltTex.offset.y + dt * -BELT) % 1;
    this.padTex.offset.y = (this.padTex.offset.y - dt * 2.5) % 1;
    this.padMat.color.setScalar(0.85 + Math.sin(t * 10) * 0.15);
    for (let i = 0; i < this.balloons.length; i++) {
      const b = this.balloons[i];
      this.balloonB.put(b.x + Math.sin(t * 0.9 + b.ph) * 0.15, b.y + Math.sin(t * 1.3 + b.ph) * 0.3, -b.s, b.r * 2, b.r * 2.3, b.r * 2, undefined, 0, false, i);
    }
    for (const q of this.archQ) q.rotation.y = t * 1.2 * (q.userData.spin as number);
  }

  /** The chains lean with their balls (put() turns round y only, so the tilt goes in here). */
  private chainTilt() {
    const e = this.ce,
      q = this.qa,
      p = this.v,
      k = this.v2;
    this.c.swings.forEach((sw, i) => {
      if (sw.dead) return;
      e.set(0, 0, sw.a);
      q.setFromEuler(e);
      p.set(Math.sin(sw.a) * SL * 0.5, PY - Math.cos(sw.a) * SL * 0.5, -sw.s);
      this.m4.compose(p, q, k.set(0.14, SL, 0.14));
      this.chainB.mesh.setMatrixAt(i, this.m4);
    });
    this.chainB.mesh.instanceMatrix.needsUpdate = true;
  }

  private subjectS() {
    const hu = this.hu >= 0 ? this.R[this.hu] : null;
    if (hu && (hu.st === RUN || hu.st === CLIMB)) return hu.s;
    let m = -Infinity;
    for (const r of this.R) if (r.st === RUN || r.st === CLIMB) m = Math.max(m, r.s);
    return m > -Infinity ? m : this.c.fin + 4;
  }

  /** The play camera: behind and over the Q, looking down the road over the runners. */
  private playCam(eye: THREE.Vector3, at: THREE.Vector3) {
    const hu = this.hu >= 0 ? this.R[this.hu] : null;
    let sub: number,
      sx = 0;
    if (hu && (hu.st === RUN || hu.st === CLIMB)) ((sub = hu.s), (sx = hu.x));
    else {
      sub = -Infinity;
      for (const r of this.R) if ((r.st === RUN || r.st === CLIMB) && r.s > sub) ((sub = r.s), (sx = r.x));
      if (sub === -Infinity) ((sub = this.c.fin + 6), (sx = hu && hu.st === DONE ? hu.x : 0));
    }
    // (far ahead of the Q: up and along, the Q left behind bit by bit)
    const over = this.focusQ > 0 ? 0 : clamp(sub - this.qcs - 14, 0, 40);
    let c = this.qcs + over * 0.6;
    c = Math.min(c, this.c.fin - 4);
    const up = Math.min(over, 20);
    // (on the Q, the visitor stuck to its face: over it and looking down on it)
    const f = this.focusQ > 0 ? 1 : 0;
    eye.set(sx * 0.3 * (1 - f), CAM_H + up * 0.4 + f * 3, -(c - CAM_BACK + f * 3));
    at.set(sx * 0.5 * (1 - f), 0, -(c + CAM_AHEAD + up * 0.3 - f * 6));
  }

  /** The intro cinematic's shots (host.ts → cine.ts): the giant Q looming low, then a flight down the road ahead to the finish. */
  intro(): IntroShot[] {
    const q = this.qcs;
    const fin = this.c.fin;
    const mid = (START + fin) / 2;
    return [
      { eye: [QS * 1.1, 1.2, -(q + QS * 1.5)], eye2: [QS * 0.55, 1.6, -(q + QS * 1.15)], at: [0, QS * 0.62, -q], at2: [0, QS * 0.55, -q], fov: 54, fov2: 46, say: "The giant Z-Block rolls after you!", sayZh: "巨大的 Z 方块在你身后滚来！", chip: "THE HAZARD", chipZh: "危险" },
      { eye: [7, 9, -(START + 2)], via: [[6, 8, -mid]], eye2: [4, 6.5, -(fin - 8)], at: [0, 1, -(START + 24)], atVia: [[0, 1, -(mid + 22)]], at2: [0, 1.5, -(fin + 6)], fov: 56, fov2: 50, w: 1.4 },
    ];
  }

  /** The card: in front of the line, the four snarks and the giant Z-Block behind them. */
  private cardCam(k: number) {
    const a = 0.25 + Math.sin(k * 0.3) * 0.3;
    this.eye.set(Math.sin(a) * 15, 6.5 + Math.sin(k * 0.5) * 0.4, -(START + 15 * Math.cos(a)));
    this.at.set(0, 3.6, -(START - 6));
    this.cam.set(this.eye, this.at);
  }

  idle(dt: number, phase: "card" | "count", k: number) {
    this.it += dt;
    if (this.lab) (window as unknown as Record<string, unknown>).__rollPhase = { ph: phase, t: 0 };
    for (const r of this.R) {
      r.a.legs = 0;
      r.a.pos.set(r.x, 0, -r.s);
      r.a.yaw = Math.PI;
      r.a.sync(dt);
    }
    this.animProps(dt);
    this.placeQ(phase === "count" ? Math.sin(this.it * 60) * 0.05 * k : 0);
    if (phase === "card") this.cardCam(k);
    else {
      if (!this.from) this.from = { eye: this.cam.eye.clone(), at: this.cam.at.clone() };
      // (a swing round the line, from in front of the snarks to behind the Z-Block)
      this.playCam(this.v, this.v2);
      const e = ease(k);
      const ps = START - 2;
      const f = this.from.eye;
      const a0 = Math.atan2(f.x, -f.z - ps),
        r0 = Math.hypot(f.x, -f.z - ps);
      let a1 = Math.atan2(this.v.x, -this.v.z - ps);
      const r1 = Math.hypot(this.v.x, -this.v.z - ps);
      if (a1 < a0) a1 += Math.PI * 2;
      const an = a0 + (a1 - a0) * e,
        rad = r0 + (r1 - r0) * e;
      this.eye.set(Math.sin(an) * rad, f.y + (this.v.y - f.y) * e, -(ps + Math.cos(an) * rad));
      this.at.lerpVectors(this.from.at, this.v2, e);
      this.cam.set(this.eye, this.at);
    }
    this.fx.update(dt);
    this.cam.apply(dt);
    this.scen.tick?.(dt, this.it, this.cam.at, 0);
  }

  /** The blizzard gusts: calm, a warning (whistle, flags, blowing snow), then the push. */
  private gusts(dt: number) {
    if (!this.L.gusts || this.over) {
      this.gk = Math.max(0, this.gk - dt * 2);
      return;
    }
    if (this.gPhase === 0) {
      if (this.t >= this.gNext) {
        this.gPhase = 1;
        this.gT = 0;
        this.gDir = this.rnd() < 0.5 ? -1 : 1;
        this.gN++;
        this.stats.gusts++;
        this.say(this.gDir > 0 ? T("GUST ►", "阵风 ►") : T("◄ GUST", "◄ 阵风"), "#4fc3ff", 1.5, 60);
        whistle();
      }
    } else if (this.gPhase === 1) {
      this.gT += dt;
      this.gWarn = Math.max(0, 1 - this.gT / GUST_WARN);
      if (this.gT >= GUST_WARN) {
        this.gPhase = 2;
        this.gT = 0;
        sfx.whoosh();
        this.cam.shake(0.18);
      }
    } else {
      this.gT += dt;
      this.gk = this.gT < 0.3 ? this.gT / 0.3 : this.gT > GUST_BLOW - 0.45 ? Math.max(0, (GUST_BLOW - this.gT) / 0.45) : 1;
      if (this.gT >= GUST_BLOW) {
        this.gPhase = 0;
        this.gk = 0;
        this.gNext = this.t + 5.2 + this.rnd() * 3;
      }
    }
    // streaks of blown snow across the view
    const amt = this.gPhase === 1 ? 0.3 * (1 - this.gWarn) + 0.1 : this.gPhase === 2 ? this.gk : 0;
    if (amt > 0) {
      const sub = this.subjectS();
      const dr = this.drnd;
      const n = Math.floor(amt * 3 + dr());
      for (let i = 0; i < n; i++)
        this.fx.burst(this.v.set(-this.gDir * 12 + (dr() - 0.5) * 20, 0.3 + dr() * 3.5, -(sub - 6 + dr() * 30)), 1, ["#ffffff", "#e0f4ff"], {
          speed: 0.4,
          up: 0,
          gravity: 0,
          drag: 0,
          life: 1.1,
          size: 0.13,
          dir: this.v2.set(this.gDir * (14 + amt * 8), -0.6, 0),
        });
    }
  }

  update(dt: number, input: Input) {
    this.it += dt;
    if (!this.over) this.t += dt;
    if (this.lab) (window as unknown as Record<string, unknown>).__rollPhase = { ph: "play", t: this.t, hu: this.hu >= 0 ? this.R[this.hu].st : -1, s: this.hu >= 0 ? Math.round(this.R[this.hu].s) : 0, q: Math.round(this.qf) };
    this.stepQ(dt);
    this.gusts(dt);
    this.animProps(dt);
    for (const r of this.R) {
      if (r.st === RUN || r.st === CLIMB) {
        this.step(r, dt, input);
        if (r.st !== RUN && r.st !== CLIMB) continue;
        // under its face as it lands?
        const hb = Math.max(0.3, 1.5 * MS + r.y);
        if (r.s - RB * 0.5 < this.danger(hb)) this.flatten(r);
        else if (r.s >= this.c.fin && r.st === RUN) this.arrive(r);
      } else if (r.st === DONE) this.stepDone(r, dt);
      else this.stepOut(r, dt);
    }
    this.bumps(dt);
    this.events();
    this.focusQ = Math.max(0, this.focusQ - dt);
    // the end: nobody left running (or the cap)
    if (!this.over) {
      const left = this.R.some((r) => r.st === RUN || r.st === CLIMB);
      if (!left || this.t >= CAP || (this.qStopped && this.t - this.qStopT > 10)) this.end();
    }
    // the Q pops into coins once it is all over at the goal
    if (this.qStopped && !this.qBurst && !this.R.some((r) => r.st === RUN || r.st === CLIMB)) this.burstQ();
    this.fx.update(dt);
    this.playCam(this.v, this.v2);
    this.cam.to(this.v, this.v2, dt, 3.2, 4.5);
    this.cam.apply(dt);
    this.scen.tick?.(dt, this.it, this.cam.at, this.gPhase === 2 ? this.gDir * this.gk : this.gPhase === 1 ? this.gDir * 0.2 * (1 - this.gWarn) : 0);
    for (const b of this.banners) b.t += dt;
    while (this.banners.length && this.banners[0].t >= this.banners[0].d) this.banners.shift();
  }

  private arrive(r: Run) {
    r.st = DONE;
    r.place = this.arrivals.length;
    this.arrivals.push(r.i);
    r.cheer = 0.4;
    this.fx.burst(this.v.set(r.x, 2, -r.s), 30, [r.p.color, GOLD, "#ffffff", "#ff5fa2", "#3ec6ff"], { speed: 8, up: 7, size: 0.26 });
    if (r.p.human) {
      sfx.star();
      this.say(`${T("GOAL!", "到达！")} ${ord(r.place).toUpperCase()}`, GOLD, 2.2, 72);
    } else sfx.coin();
  }

  private burstQ() {
    this.qBurst = true;
    this.qSq.visible = false;
    this.mark.visible = false;
    const c = this.v.set(0, QS / 2, -this.qcs);
    for (let i = 0; i < 4; i++) this.fx.burst(c, 40, [GOLD, "#fff4c4", "#c98a00", "#ffffff"], { speed: 14, up: 8, size: 0.5, life: 1.6 });
    this.cam.shake(0.6);
    boom(0.8);
    sfx.star();
  }

  private end() {
    const order = [...this.arrivals];
    const inn = this.R.filter((r) => r.st === RUN || r.st === CLIMB).sort((a, b) => b.s - a.s || a.i - b.i);
    for (const r of inn) order.push(r.i);
    const outs = [...this.outs].sort((a, b) => b.out - a.out || b.outS - a.outS || a.i - b.i);
    for (const r of outs) order.push(r.i);
    this.over = order;
    if (this.lab)
      (window as unknown as Record<string, unknown>).__rollDbg = {
        t: +this.t.toFixed(1),
        level: this.L.key,
        fin: +this.c.fin.toFixed(0),
        runners: this.R.map((r) => ({ seat: r.i, sk: r.p.skill, st: ["run", "climb", "fall", "flat", "done", "flung"][r.st], place: r.place, out: +r.out.toFixed(1), s: +(r.st === DONE ? this.c.fin : r.outS || r.s).toFixed(0) })),
        ...this.stats,
        log: this.log,
        chunks: this.c.chunks.join(" "),
      };
    if (this.arrivals.length) this.R[this.arrivals[0]].a.cheer(3);
  }

  /** The announcer: the start, the Q speeding up, the last stretch. */
  private events() {
    const once = (k: string) => (this.said.has(k) ? false : (this.said.add(k), true));
    if (this.over) return;
    if (this.t > 0.55 && once("run")) this.say(T("RUN!", "快跑！"), GOLD, 1.3, 84);
    for (const at of [18, 33])
      if (this.t > at && once(`fast${at}`)) {
        this.say(T(at === 18 ? "FASTER!" : "EVEN FASTER!", at === 18 ? "加速了！" : "再加速！"), "#ff7a3d", 1.6, 56);
        this.qGlow = 1;
        this.cam.shake(0.3);
        beep(110, 0.5, "sawtooth", 0.3, 0.6);
      }
    let lead = -Infinity,
      n = 0;
    for (const r of this.R) if (r.st === RUN || r.st === CLIMB) ((lead = Math.max(lead, r.s)), n++);
    // (the level's twist, announced as it comes into view)
    const sub = this.subjectS();
    if (this.c.ices.length && this.t > 2 && sub > this.c.ices[0].s0 - 13 && once("ice")) this.say(T("ICE! SLIPPERY!", "冰面！会打滑！"), "#4fc3ff", 1.6, 54);
    if (this.c.pools.length && this.t > 2 && sub > this.c.pools[0].s0 - 13 && once("pool")) this.say(T("HOP ON THE RAFTS!", "跳上筏子！"), GOLD, 1.8, 54);
    if (n && lead > this.c.fin - 55 && once("last")) {
      this.say(T("LAST STRETCH!", "最后冲刺！"), "#3ec6ff", 1.6, 60);
      music.rate(1.15);
    }
  }

  private say(s: string, c: string, d: number, size: number) {
    // (a newer shout cuts a long one short)
    if (this.banners.length > 1) this.banners.splice(1);
    if (this.banners.length && this.banners[0].t < this.banners[0].d * 0.8) this.banners[0].t = Math.max(this.banners[0].t, this.banners[0].d * 0.8);
    this.banners.push({ s, t: 0, d, c, size });
  }

  view() {
    return this.w;
  }

  // ---- the HUD -----------------------------------------------------------------------------------

  draw(g: CanvasRenderingContext2D) {
    const cam = this.w.camera;
    const hu = this.hu >= 0 ? this.R[this.hu] : null;
    // the danger glow: the Q right behind you
    if (hu && (hu.st === RUN || hu.st === CLIMB) && !this.over) {
      const gap = hu.s - this.qf;
      if (gap < QS + 3) {
        const k = clamp(1 - (gap - QS * 0.5) / (QS * 0.5 + 3), 0, 1) * (0.55 + 0.45 * Math.sin(this.it * 14));
        const gr = g.createLinearGradient(0, H, 0, H * 0.55);
        gr.addColorStop(0, `rgba(255,40,70,${0.5 * k})`);
        gr.addColorStop(1, "rgba(255,40,70,0)");
        g.fillStyle = gr;
        g.fillRect(0, H * 0.55, W, H * 0.45);
      }
    }
    // the ones hidden behind the Q: their portrait over it (an x-ray)
    if (!this.qBurst) {
      this.qRot.updateWorldMatrix(true, false);
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity;
      for (let i = 0; i < 8; i++) {
        this.v.set(i & 1 ? QS / 2 : -QS / 2, i & 2 ? QS / 2 : -QS / 2, i & 4 ? QS / 2 : -QS / 2).applyMatrix4(this.qRot.matrixWorld);
        const p = toScreen(this.v, cam);
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
      }
      for (const r of this.R) {
        if ((r.st !== RUN && r.st !== CLIMB) || r.s - this.qf > 9) continue;
        const p = toScreen(this.v.set(r.x, r.y + 0.8 * MS, -r.s), cam);
        if (p.x < minX || p.x > maxX || p.y < minY + 6) continue;
        g.save();
        g.globalAlpha = 0.8 + Math.sin(this.it * 16) * 0.2;
        g.strokeStyle = r.p.color;
        g.lineWidth = 3;
        g.beginPath();
        g.arc(p.x, p.y, 17, 0, Math.PI * 2);
        g.stroke();
        token(g, r.p, p.x, p.y, 13, { shadow: false });
        g.restore();
      }
    }
    // name tags (the visitor's last, on top)
    const order = [...this.R].sort((a, b) => (a.p.human ? 1 : 0) - (b.p.human ? 1 : 0));
    for (const r of order) {
      if (r.st !== RUN && r.st !== CLIMB && r.st !== DONE) continue;
      const s = toScreen(r.a.head(this.v), cam);
      if (!s.on) continue;
      tag(g, r.p, s.x, s.y);
      // (in the Q's landing square: a red "!" over the visitor)
      if (r.p.human && r.st === RUN && !this.qStopped && !this.qBurst && r.s < this.qf + QS + 0.3) {
        const k = 1 + Math.max(0, Math.sin(this.it * 18)) * 0.18;
        g.save();
        g.translate(s.x, s.y - 30);
        g.scale(k, k);
        g.fillStyle = "#ff2e4d";
        g.beginPath();
        g.arc(0, 0, 13, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "#ffffff";
        g.lineWidth = 2.5;
        g.stroke();
        text(g, "!", 0, 1, 18, "#ffffff", "center", 900);
        g.restore();
      }
    }
    this.drawBar(g);
    if (this.gPhase > 0 && !this.over) this.drawWind(g);
    // the visitor's place: top left, level with the bar (on a touch screen the bottom corners are the thumbs')
    if (hu && (hu.st === RUN || hu.st === CLIMB || hu.st === DONE)) {
      let place = hu.st === DONE ? hu.place : this.arrivals.length;
      if (hu.st !== DONE) for (const r of this.R) if (r !== hu && (r.st === RUN || r.st === CLIMB) && r.s > hu.s) place++;
      const col = place === 0 ? GOLD : "#ffffff";
      const px = 74,
        by = 62;
      g.save();
      g.font = `900 58px Geist, Roboto, sans-serif`;
      g.textAlign = "right";
      g.textBaseline = "alphabetic";
      g.lineJoin = "round";
      g.lineWidth = 9;
      g.strokeStyle = "rgba(10,8,24,0.85)";
      const n = String(place + 1);
      g.strokeText(n, px, by);
      g.fillStyle = col;
      g.fillText(n, px, by);
      g.font = `900 24px Geist, Roboto, sans-serif`;
      g.textAlign = "left";
      g.lineWidth = 6;
      const suf = T(["st", "nd", "rd", "th"][place] ?? "th", "名");
      g.strokeText(suf, px + 4, by - 22);
      g.fillText(suf, px + 4, by - 22);
      g.restore();
    }
    const b = this.banners[0];
    if (b) banner(g, b.s, b.t / b.d, b.c, SAY_Y, b.size);
  }

  /** A gust's sign under the bar: chevrons racing the way it blows (pulsing while it warns). */
  private drawWind(g: CanvasRenderingContext2D) {
    const blow = this.gPhase === 2;
    const a = blow ? 0.55 + 0.45 * this.gk : 0.45 + 0.4 * Math.max(0, Math.sin(this.it * 12));
    const cx = W / 2,
      cy = 84;
    g.save();
    g.globalAlpha = a;
    rr(g, cx - 120, cy - 20, 240, 40, 20);
    g.fillStyle = blow ? "rgba(30,70,140,0.85)" : "rgba(12,9,28,0.7)";
    g.fill();
    g.strokeStyle = "#bfe8ff";
    g.lineWidth = 2;
    g.stroke();
    text(g, T("GUST", "阵风"), cx - this.gDir * 64, cy + 1, 18, "#ffffff", "center", 900);
    // (three chevrons sliding downwind)
    const ph = (this.it * (blow ? 3 : 1.5)) % 1;
    g.strokeStyle = "#ffffff";
    g.lineWidth = 4;
    g.lineCap = "round";
    for (let i = 0; i < 3; i++) {
      const x = cx + this.gDir * (-14 + (i + ph) * 26);
      g.beginPath();
      g.moveTo(x - this.gDir * 7, cy - 9);
      g.lineTo(x + this.gDir * 5, cy);
      g.lineTo(x - this.gDir * 7, cy + 9);
      g.stroke();
    }
    g.restore();
  }

  /**
   * Along the top: the road from the line to the goal, the Q eating it up from behind (red), the four
   * heads on it. One solid plate, so nothing of the scene shows through it.
   */
  private drawBar(g: CanvasRenderingContext2D) {
    // (a small touch screen: the whole plate grows about its top, as the clock does)
    this.barG = g;
    zoom(g, W / 2, 10, clockK(), this.barF);
  }
  private barG: CanvasRenderingContext2D | null = null;
  private barF = () => this.barAt(this.barG!);
  private barBody: CanvasGradient | null = null;
  private barAt(g: CanvasRenderingContext2D) {
    const X0 = 262,
      X1 = 700,
      Y = 32,
      PH = 40;
    const px0 = X0 - 36,
      pw = X1 + 46 - px0;
    const L = this.c.fin - START;
    // the plate: a drop, an ink edge, dark glass, a light line along its top (the corner panels' make)
    rr(g, px0, Y - PH / 2 + 4, pw, PH, PH / 2);
    g.fillStyle = "rgba(6,3,18,0.38)";
    g.fill();
    rr(g, px0 - 2, Y - PH / 2 - 2, pw + 4, PH + 4, PH / 2 + 2);
    g.fillStyle = "#1a1033";
    g.fill();
    rr(g, px0, Y - PH / 2, pw, PH, PH / 2);
    if (!this.barBody) {
      this.barBody = g.createLinearGradient(0, Y - PH / 2, 0, Y + PH / 2);
      this.barBody.addColorStop(0, "#35277a");
      this.barBody.addColorStop(1, "#1a1245");
    }
    g.fillStyle = this.barBody;
    g.fill();
    rr(g, px0 + PH / 2, Y - PH / 2 + 2.5, pw - PH, 2, 1);
    g.fillStyle = "rgba(255,255,255,0.18)";
    g.fill();
    // the road: a groove, its quarters marked
    rr(g, X0 - 5, Y - 5, X1 - X0 + 10, 10, 5);
    g.fillStyle = "rgba(8,4,26,0.7)";
    g.fill();
    rr(g, X0 - 3, Y - 3, X1 - X0 + 6, 6, 3);
    g.fillStyle = "rgba(255,255,255,0.22)";
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.3)";
    for (let i = 1; i < 4; i++) g.fillRect(X0 + ((X1 - X0) * i) / 4 - 1, Y - 8, 2, 3);
    // (the Q starts behind the line: its marker waits left of the road's start)
    const qx = Math.max(X0 - 18, X0 + ((this.qf - START) / L) * (X1 - X0));
    if (qx > X0 - 3 && !this.qBurst) {
      rr(g, X0 - 3, Y - 3, Math.min(qx, X1) - X0 + 3, 6, 3);
      g.fillStyle = "#ff3d5a";
      g.fill();
    }
    // the goal: a chequered flag in a white frame
    rr(g, X1 + 12, Y - 11, 22, 22, 5);
    g.fillStyle = "#ffffff";
    g.fill();
    g.fillStyle = "#1a1033";
    for (let yy = 0; yy < 3; yy++) for (let xx = 0; xx < 3; xx++) if ((xx + yy) % 2 === 0) g.fillRect(X1 + 14 + xx * 6, Y - 9 + yy * 6, 6, 6);
    // the Z-Block: a golden block (under the heads: a runner it is about to catch stays in sight)
    if (!this.qBurst) {
      rr(g, qx - 13, Y - 13, 26, 26, 6);
      g.fillStyle = "#1a1033";
      g.fill();
      rr(g, qx - 11, Y - 11, 22, 22, 4.5);
      g.fillStyle = GOLD;
      g.fill();
      rr(g, qx - 11, Y - 11, 22, 7, 4.5);
      g.fillStyle = "rgba(255,255,255,0.35)";
      g.fill();
      text(g, "Z", qx, Y + 1.5, 15, "#7a5200", "center", 900);
    }
    // the heads: the out ones dimmed and crossed where they went out, the finished ones lined up at the flag, the visitor on top
    const order = this.barOrder;
    order.length = 0;
    for (const r of this.R) order.push(r);
    order.sort(barSort);
    for (const r of order) {
      const out = r.st === FALL || r.st === FLAT || r.st === FLUNG;
      const x = r.st === DONE ? X1 - r.place * 13 : X0 + clamp(((out ? r.outS : r.s) - START) / L, 0, 1) * (X1 - X0);
      const rad = r.p.human ? 12.5 : 9.5;
      if (r.p.human && !out) {
        // (you: a white ring round your head)
        g.beginPath();
        g.arc(x, Y, rad + 2.5, 0, Math.PI * 2);
        g.fillStyle = "#ffffff";
        g.fill();
      }
      token(g, r.p, x, Y, rad, { shadow: false, dim: out });
      if (out) {
        g.strokeStyle = "#ff5a6e";
        g.lineWidth = 3;
        g.lineCap = "round";
        g.beginPath();
        g.moveTo(x - 5, Y - 5);
        g.lineTo(x + 5, Y + 5);
        g.moveTo(x + 5, Y - 5);
        g.lineTo(x - 5, Y + 5);
        g.stroke();
      }
    }
  }
  private barOrder: Run[] = [];

  result() {
    return this.over;
  }

  humanOut() {
    if (this.over || this.hu < 0 || (this.dbg && location.search.includes("rollnoff"))) return false;
    // (after the gag: the fall a moment, the ride on the Q's face)
    const r = this.R[this.hu];
    return (r.st === FALL && this.t - r.out > 1.2) || r.st === FLUNG || (r.st === FLAT && this.t - r.out > 6.5);
  }

  dispose() {
    for (const r of this.R) r.a.dispose();
    disposeScene(this.w.scene);
  }
}

export const ROLL: MiniDef = {
  key: "roll",
  title: "BIG Z ROLL",
  titleZh: "巨Z滚滚来",
  tag: "The giant Z-Block is rolling after you: run! Over ZStreet, the frozen Sprout river, Marina Bay's rooftops.",
  tagZh: "巨大的Z方块滚过来了：快跑！ZStreet 上空、冰封的 Sprout 河、滨海湾屋顶。",
  goal: "Outrun the giant Z-Block: first to the finish arch wins!",
  goalZh: "跑赢巨大的 Z 方块：第一个冲到终点拱门的赢！",
  // (a touch screen's buttons say what they do, acts.ts: the rules name those words there, not A and B)
  get help() {
    return touchy()
      ? `▲ run, ◀ ▶ dodge, ${ACT.jump.en} over the gaps and bars, ${ACT.shove.en} a rival. Keep out of the dark square: the Z-Block lands there next!`
      : "▲ run, ◀ ▶ dodge, A jump the gaps and bars, B shove. Keep out of the dark square: the Z-Block lands there next!";
  },
  get helpZh() {
    return touchy() ? `▲ 奔跑，◀ ▶ 闪避，按「${ACT.jump.zh}」跳过缺口和栏杆，按「${ACT.shove.zh}」推人。别站在暗色方块里：Z 方块下一步落在那里！` : "▲ 奔跑，◀ ▶ 闪避，A 跳过缺口和栏杆，B 推人。别站在暗色方块里：Z 方块下一步落在那里！";
  },
  pad: ["left", "right", "up", "down", "a", "b"],
  tap: false,
  color: GOLD,
  song: "hero",
  ambience: "city-day",
  variants: LEVELS.map((l) => ({ key: l.key, title: l.title, titleZh: l.titleZh, tag: l.tag, tagZh: l.tagZh, thumb: `roll-${l.key}`, song: l.song, ambience: l.ambience })),
  make: (players, rnd, variant) => new Roll(players, rnd, LEVELS.find((l) => l.key === variant) ?? LEVELS[Math.floor(rnd() * LEVELS.length) % LEVELS.length]),
};

export default ROLL;
