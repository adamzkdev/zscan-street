/**
 * ⓩ SHOWER (币雨): a coin-rain scramble. ⓩ coins rain down in waves, a shadow on the ground
 * showing where each will land; now and then a big blue-gold one worth 5. Rug bombs fall too: they
 * land, blink and blow, and whoever is caught is flung, dizzy, and drops 3 coins for anyone to grab.
 * Arrows run (screen-relative), A dives: a dive into a rival knocks one of their coins out. Most
 * coins in 30 s wins; a tie goes to whoever reached that count first. From 10 s left: HURRY!, and
 * the rain doubles.
 *
 * Online (lockstep, src/party/net/lockstep.ts): every person's seat reads its own input
 * (`inputOf`), "up" is turned by where that seat's own camera aims (not the eased one), and only the
 * local player's camera, HUD flashes and sounds go by `isLocal`.
 *
 * Three levels (coins-levels/): ⓩ PLAZA (noon on the city's rooftop, the classic), MARINA RAIN
 * (a rainy night on a Marina Bay sky-deck: gusts blow the coins sideways, the pool and the puddles
 * slow you) and CENTRAL PARK RINK (a snowy evening on a round plaza in Central Park: a slippery ice rink round a frozen
 * fountain that thaws and bursts out coins).
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { T } from "../../i18n/lang";
import { music } from "../music";
import { H, HUD, W, backOut, clamp, inputOf, isLocal, ord, rankBy, sfx, shout, sound, type Input, type Mini, type MiniDef, type Player, type Rnd } from "../kit";
import { Hasher } from "../net/hash";
import { Avatar, CamRig, Fx3, GEO, banner, canvasTex, clock, coin, corners, disposeScene, glow, tag, toScreen, toon, toonSteps, world, yawOf, zGlyph } from "../k3";
import { Batch, within, type Circle, type Box, type Level, type SetAnim, type Weather } from "./coins-levels/set";
import { PLAZA } from "./coins-levels/plaza";
import { MARINA } from "./coins-levels/marina";
import { ASTANA } from "./coins-levels/astana";

/** The levels, in the hall's order. */
export const COIN_LEVELS: Level[] = [PLAZA, MARINA, ASTANA];

const TIME = 30;
/** HURRY! and the rain doubles with this much left. */
const HURRY_AT = TIME - 10;
/** A snark's round body, its top speed (m/s). */
const PR = 0.46;
/** The snarks a little larger than life: readable from the plaza's camera. */
const SIZE = 1.18;
const SPEED = 6.6;
/** The dive: its speed, how long, the wait before the next, the slow get-up after it. */
const DASH_V = 12.5;
const DASH_T = 0.22;
const DASH_CD = 1.05;
const RECOVER = 0.28;
/** How near a coin must be to be grabbed (a big one: a little further). */
const PICK = 0.9;
const PICK_BIG = 1.2;
const COIN_R = 0.4;
const BIG_R = 0.62;
/** A rug bomb: its blast radius, its fuse once down, the stun, what it costs. */
const BLAST = 2.45;
const FUSE = 0.8;
const STUN_BOMB = 1.2;
const STUN_TACKLE = 0.6;
const IMMUNE = 0.7;
const DROP = 3;
const COIN_CAP = 110;
const BOMB_CAP = 8;
/** The combo's notes (semitones up a major scale). */
const STEPS = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21];

interface Coin {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** 0 falling from the sky, 1 bouncing (landed, dropped, kicked), 2 resting on the floor. */
  st: number;
  /** Worth (1, or 5 for a big one), radius, gravity while it falls. */
  v: number;
  r: number;
  g: number;
  ry: number;
  tilt: number;
  /** Falling: when it lands (game time), and from how high it started. */
  tl: number;
  y0: number;
  age: number;
  life: number;
  ph: number;
  born: number;
  /** Not to be grabbed before pickAt; not by `owner` (who dropped it) before ownerT. */
  pickAt: number;
  owner: number;
  ownerT: number;
  big: Big | null;
  dead: boolean;
}

interface Big {
  g: THREE.Group;
  halo: THREE.Sprite;
  beam: THREE.Mesh;
  beamMat: THREE.MeshBasicMaterial;
  ring: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  used: boolean;
}

interface Bomb {
  g: THREE.Group;
  body: THREE.Object3D;
  light: THREE.Mesh;
  danger: THREE.Mesh;
  dmat: THREE.MeshBasicMaterial;
  used: boolean;
  x: number;
  z: number;
  y: number;
  vy: number;
  /** The bounce once down. */
  hy: number;
  hv: number;
  t0: number;
  tl: number;
  boomAt: number;
  landed: boolean;
  blink: number;
  on: boolean;
  /** Each AI: when it sees this one coming, and how wrong it runs (radians). */
  notice: number[];
  panic: number[];
}

interface Run {
  a: Avatar;
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
  lean: number;
  sq: number;
  stars: THREE.Group;
  /** The AI: its next think, its coin, where it goes else, its moods. */
  think: number;
  tgt: Coin | null;
  tx: number;
  tz: number;
  wanderAt: number;
  greedy: boolean;
  revenge: number;
  revengeT: number;
  tackleAt: number;
  pause: number;
  want: boolean;
  wdx: number;
  wdz: number;
  /** What it last ran from (a bomb, the thawing fountain). */
  escFor: object | null;
  escDive: boolean;
  jumpAt: number;
  /** Cross for a moment (after a dive into it, a blast). */
  angryT: number;
  /** A press of A a moment early still counts (the human's dive). */
  buf: number;
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
interface Flash {
  m: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  t: number;
  on: boolean;
}

// ---- sound (the kit's tone() is private: a little synth of our own on its bus) --------------------

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
let noiseBuf: AudioBuffer | null = null;
/** A rug bomb going off: a low rumble and a falling thump. */
function boom(vol = 0.9) {
  const s = sound();
  if (!s) return;
  const ac = s.ac;
  if (!noiseBuf || noiseBuf.sampleRate !== ac.sampleRate) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = ac.currentTime;
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  const f = ac.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.setValueAtTime(1800, t);
  f.frequency.exponentialRampToValueAtTime(160, t + 0.6);
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
  src.connect(f).connect(g).connect(s.bus);
  src.start(t);
  src.stop(t + 0.75);
  beep(90, 0.45, "sine", vol, 0.35);
}

/** A gust: a band of noise that swells and dies away over `dur` seconds. */
function gale(dur: number, vol = 0.5) {
  const s = sound();
  if (!s) return;
  const ac = s.ac;
  if (!noiseBuf || noiseBuf.sampleRate !== ac.sampleRate) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = ac.currentTime;
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ac.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = 1.4;
  f.frequency.setValueAtTime(380, t);
  f.frequency.linearRampToValueAtTime(1100, t + dur * 0.35);
  f.frequency.linearRampToValueAtTime(520, t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.25);
  g.gain.setValueAtTime(vol, t + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(s.bus);
  src.start(t);
  src.stop(t + dur + 0.05);
}

/** Soft round marks on the stones (the coins' and bombs' shadows, the scorches): one instanced draw. */
class Marks {
  readonly mesh: THREE.InstancedMesh;
  private n = 0;
  private cap: number;
  private m = new THREE.Matrix4();
  private col: THREE.InstancedBufferAttribute;
  constructor(scene: THREE.Scene, cap = 160) {
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
        void main() { float d = length(vUv - 0.5) * 2.0; float a = (1.0 - smoothstep(mix(0.45, 0.0, vC.g), 1.0, d)) * vC.r; gl_FragColor = vec4(0.07, 0.04, 0.14, a); }`,
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
  /** A mark `r` metres round, `a` dark (0…1), `soft` 0 (crisp) … 1 (all blur). */
  add(x: number, z: number, r: number, a: number, soft = 0.3, y = 0) {
    if (this.n >= this.cap || a <= 0.005) return;
    this.m.makeScale(r * 2, 1, r * 2).setPosition(x, y + 0.025, z);
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

// ---- the game ------------------------------------------------------------------------------------

class Shower implements Mini {
  private w: ReturnType<typeof world>;
  /** The level played (the bench and the sims read its key). */
  readonly levelKey: string;
  private XW: number;
  private ZD: number;
  private circles: Circle[];
  private boxes: Box[];
  /** The AI sees every obstacle as circles. */
  private avoid: Circle[];
  private setAnim: SetAnim | null;
  /** The weather the set is told about (gusts, the thaw). */
  private wx: Weather = { wind: 0, warn: 0, dir: 1, thaw: 0, burst: false, t: 0, players: [], boom: false, boomX: 0, boomZ: 0 };
  /** The gust: 0 calm, 1 warning, 2 blowing; its clock, its side, the next one. */
  private gustPh = 0;
  private gustT = 0;
  private gustAt = 99;
  /** The thaw: 0 frozen, 1 cracking (the warning); its clock, the next one. */
  private thawPh = 0;
  private thawT = 0;
  private thawAt = 99;
  /** (the thawing fountain, as something to run from) */
  private thawMark = {};
  private cam: CamRig;
  private fx: Fx3;
  private run: Run[];
  private score = [0, 0, 0, 0];
  /** reach[seat][n]: when that seat first had n coins (the tie-break). */
  private reach: number[][] = [[0], [0], [0], [0]];
  private t = 0;
  private clk = 0;
  private phase: "card" | "count" | "play" = "card";
  private over: number[] | null = null;
  private post = 0;
  private hurry = false;
  private coins: Coin[] = [];
  private bigs: Big[] = [];
  private bombs: Bomb[] = [];
  private pending: { at: number; x: number; z: number; k: number }[] = [];
  private waveAt = 0.8;
  private rainAt = 0.3;
  private bombAt = 3.2;
  private bigTimes: number[];
  private bigI = 0;
  private lastTick = 99;
  private coinMesh: THREE.InstancedMesh;
  private coinL = new THREE.Matrix4();
  private marks: Marks;
  private rings: Ring[] = [];
  private flashes: Flash[] = [];
  private scorch: { x: number; z: number; t: number }[] = [];
  private pops: { seat: number; s: string; c: string; t: number; t0: number; big: boolean; sub: string }[] = [];
  private banners: { s: string; c: string; t: number; dur: number; size: number }[] = [];
  private bump = [0, 0, 0, 0];
  private loss = [0, 0, 0, 0];
  /** The corner panels' figures, places and leaders (kept: the HUD makes no garbage). */
  private vals = ["", "", "", ""];
  private subs = ["", "", "", ""];
  private leads: number[] = [];
  private combo = 0;
  /** A red flash when you are blown up, a gold one for your big coin. */
  private hurt = 0;
  private gold = 0;
  private lastPick = -9;
  /** The seat this device plays (-1: none): the camera leans toward it, its flashes and sounds. Never read by the rules. */
  private you: number;
  private ink: THREE.MeshBasicMaterial;
  private spikeGeo: THREE.BufferGeometry;
  private bandGeo: THREE.BufferGeometry;
  private bandMat: THREE.MeshToonMaterial;
  private dangerTex: THREE.Texture;
  private starGeo: THREE.BufferGeometry;
  private bigFace: THREE.Material[];
  private haloTex: THREE.Texture;
  private redOn = glow("#ff2b3d");
  private redOff = toon("#5a1a24");
  /** What happened (the bench reads it). */
  readonly stats = { coins: 0, bigs: 0, bombs: 0, blown: 0, tackles: 0, dives: 0, seat: [0, 1, 2, 3].map(() => ({ got: 0, blown: 0, tackled: 0, tackler: 0, dist: 0 })) };
  // (this frame's move, from brain())
  private mx = 0;
  private mz = 0;
  private wantDash = false;
  private ddx = 0;
  private ddz = 0;
  private sp = { x: 0, z: 0 };
  private v = new THREE.Vector3();
  private eye = new THREE.Vector3();
  private at = new THREE.Vector3();
  private M = new THREE.Matrix4();
  private Q = new THREE.Quaternion();
  private E = new THREE.Euler();
  private P = new THREE.Vector3();
  private S = new THREE.Vector3();

  constructor(
    private players: Player[],
    private rnd: Rnd,
    private L: Level,
  ) {
    this.levelKey = L.key;
    this.XW = L.xw;
    this.ZD = L.zd;
    this.circles = L.circles;
    this.boxes = L.boxes;
    this.avoid = [...L.circles, ...L.boxes.flatMap((b) => (b.hx >= b.hz ? [-1, 1].map((k) => ({ x: b.x + k * (b.hx - 0.55), z: b.z, r: b.hz + 0.22 })) : [-1, 1].map((k) => ({ x: b.x, z: b.z + k * (b.hz - 0.55), r: b.hx + 0.22 }))))];
    this.w = world({ sky: L.sky, fog: L.fog, fov: 46, night: L.night });
    const s = this.w.scene;
    this.you = players.findIndex(isLocal);
    this.w.hemi.intensity = L.hemi;
    this.w.sun.position.set(...L.sun);
    if (L.sunI !== undefined) this.w.sun.intensity = L.sunI;
    if (L.sunC) this.w.sun.color.set(L.sunC);
    this.ink = new THREE.MeshBasicMaterial({ color: 0x15101f, side: THREE.BackSide });
    this.fx = new Fx3(s, 1100);
    this.setAnim = L.build({ scene: s, B: new Batch(), rnd, fx: this.fx, ink: this.ink, level: L, hemi: this.w.hemi, sun: this.w.sun });
    // the coins: one instanced draw (the kit's coin, its look)
    const proto = coin(COIN_R).children[0] as THREE.Mesh;
    this.coinMesh = new THREE.InstancedMesh(GEO.cyl, proto.material as THREE.Material[], COIN_CAP);
    this.coinMesh.frustumCulled = false;
    this.coinMesh.count = 0;
    this.coinMesh.raycast = () => {};
    s.add(this.coinMesh);
    this.coinL.makeRotationX(Math.PI / 2).multiply(new THREE.Matrix4().makeScale(COIN_R * 2, COIN_R * 0.28, COIN_R * 2));
    this.marks = new Marks(s);
    // the big coin's look: blue rim, gold face, a sparkle
    const face = new THREE.MeshToonMaterial({
      gradientMap: toonSteps(),
      emissive: 0x4a3400,
      map: canvasTex(128, 128, (g) => {
        g.fillStyle = "#2f8cff";
        g.beginPath();
        g.arc(64, 64, 64, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#ffd23f";
        g.beginPath();
        g.arc(64, 64, 50, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#fff1a8";
        g.beginPath();
        g.arc(56, 54, 36, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#ffd23f";
        g.beginPath();
        g.arc(66, 66, 36, 0, Math.PI * 2);
        g.fill();
        zGlyph(g, 67, 68, 60, "#a86a00");
        zGlyph(g, 64, 65, 60, "#ffffff");
        g.fillStyle = "#ffffff";
        g.beginPath();
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          const r = k % 2 ? 4 : 13;
          g.lineTo(100 + Math.cos(a) * r, 30 + Math.sin(a) * r);
        }
        g.fill();
      }),
    });
    const side = new THREE.MeshToonMaterial({ color: "#1f6fe0", gradientMap: toonSteps(), emissive: 0x0a2050 });
    this.bigFace = [side, face, face];
    this.haloTex = canvasTex(64, 64, (g) => {
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, "rgba(255,250,210,0.95)");
      gr.addColorStop(0.35, "rgba(255,214,80,0.55)");
      gr.addColorStop(1, "rgba(255,190,40,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
    });
    for (let i = 0; i < 2; i++) this.bigs.push(this.makeBig());
    // the bombs' shared bits
    const spikes: THREE.BufferGeometry[] = [];
    const dirs: [number, number][] = [];
    for (let k = 0; k < 6; k++) dirs.push([(k / 6) * Math.PI * 2, 0]);
    for (let k = 0; k < 3; k++) dirs.push([(k / 3) * Math.PI * 2 + 0.5, 0.85], [(k / 3) * Math.PI * 2 + 1.5, -0.8]);
    const up = new THREE.Vector3(0, 1, 0);
    for (const [az, el] of dirs) {
      const d = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
      const c = new THREE.ConeGeometry(0.11, 0.28, 4);
      c.translate(0, 0.52, 0);
      c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, d));
      spikes.push(c.toNonIndexed());
      c.dispose();
    }
    const cap = new THREE.CylinderGeometry(0.13, 0.15, 0.16, 10).translate(0, 0.47, 0).toNonIndexed();
    spikes.push(cap);
    this.spikeGeo = mergeGeometries(spikes)!;
    for (const g of spikes) g.dispose();
    this.bandGeo = new THREE.CylinderGeometry(0.465, 0.465, 0.2, 24, 1, true);
    const rug = canvasTex(256, 32, (g) => {
      g.fillStyle = "#e8304a";
      g.fillRect(0, 0, 256, 32);
      g.fillStyle = "#ffe36b";
      g.fillRect(0, 0, 256, 3);
      g.fillRect(0, 29, 256, 3);
      g.font = `900 22px Geist, Roboto, sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = "#fff";
      for (let k = 0; k < 4; k++) g.fillText("RUG", 32 + k * 64, 17);
    });
    rug.wrapS = THREE.RepeatWrapping;
    this.bandMat = new THREE.MeshToonMaterial({ map: rug, gradientMap: toonSteps() });
    this.dangerTex = canvasTex(256, 256, (g) => {
      const c = 128;
      const gr = g.createRadialGradient(c, c, 30, c, c, 124);
      gr.addColorStop(0, "rgba(255,40,70,0.10)");
      gr.addColorStop(0.8, "rgba(255,40,70,0.32)");
      gr.addColorStop(1, "rgba(255,40,70,0.55)");
      g.fillStyle = gr;
      g.beginPath();
      g.arc(c, c, 124, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "rgba(255,60,85,1)";
      g.lineWidth = 8;
      g.beginPath();
      g.arc(c, c, 119, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([22, 18]);
      g.strokeStyle = "rgba(255,255,255,0.75)";
      g.lineWidth = 6;
      g.beginPath();
      g.arc(c, c, 104, 0, Math.PI * 2);
      g.stroke();
    });
    this.starGeo = new THREE.OctahedronGeometry(0.13);
    // the snarks round the middle, you at the front
    const spots = L.starts;
    this.run = players.map((p, i) => {
      const a = new Avatar(s, p, { scale: SIZE });
      a.pos.set(spots[i][0], this.floorAt(spots[i][0], spots[i][1]), spots[i][1]);
      a.yaw = 0;
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
        lean: 0,
        sq: 0,
        stars,
        think: 0.1 + rnd() * 0.2,
        tgt: null,
        tx: a.pos.x,
        tz: a.pos.z,
        wanderAt: 0,
        greedy: false,
        revenge: -1,
        revengeT: 0,
        tackleAt: 3,
        pause: 0,
        want: false,
        wdx: 0,
        wdz: 0,
        escFor: null,
        escDive: false,
        jumpAt: 0,
        angryT: 0,
        buf: 0,
      };
    });
    this.wx.players = this.run.map((r) => r.a.pos);
    // a ring of coins round the middle to start with
    for (let k = 0; k < 8; k++) {
      const an = ((k + 0.5) / 8) * Math.PI * 2;
      const x = L.ring.x + Math.sin(an) * L.ring.r,
        z = L.ring.z + Math.cos(an) * L.ring.r;
      const c = this.newCoin(x, z, 1);
      if (c) ((c.st = 2), (c.y = this.floorAt(x, z) + 0.5), (c.life = 16));
    }
    if (L.gust) this.gustAt = L.gust.first + rnd() * 1.5;
    if (L.thaw) this.thawAt = L.thaw.first + rnd() * 1.0;
    // three big coins: early, middle, and one in the rush
    this.bigTimes = [6.5 + rnd() * 2, 13.5 + rnd() * 2.5, 22.5 + rnd() * 2.5];
    this.cam = new CamRig(this.w.camera);
    this.playCam();
    this.cam.set(this.eye, this.at);
    // (the bench's scripted checks read the game from here)
    if (location.pathname.includes("partylab")) (window as unknown as { __coins?: unknown }).__coins = this;
  }

  private makeBig(): Big {
    const g = new THREE.Group();
    const m = new THREE.Mesh(GEO.cyl, this.bigFace);
    m.rotation.x = Math.PI / 2;
    m.scale.set(BIG_R * 2, BIG_R * 0.34, BIG_R * 2);
    g.add(m);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.haloTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    halo.scale.setScalar(3.0);
    g.add(halo);
    const beamMat = new THREE.MeshBasicMaterial({ color: "#ffd86a", transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.5, 24, 16, 1, true), beamMat);
    const ringMat = new THREE.MeshBasicMaterial({ color: "#ffd23f", transparent: true, opacity: 0.8, depthWrite: false });
    const ring = new THREE.Mesh(GEO.ring, ringMat);
    ring.rotation.x = -Math.PI / 2;
    g.visible = beam.visible = ring.visible = false;
    this.w.scene.add(g, beam, ring);
    return { g, halo, beam, beamMat, ring, ringMat, used: false };
  }

  private makeBomb(): Bomb {
    const g = new THREE.Group();
    const body = new THREE.Group();
    const ball = new THREE.Mesh(GEO.ball, toon("#2b2342"));
    ball.scale.setScalar(0.92);
    const hull = new THREE.Mesh(GEO.ball, this.ink);
    hull.scale.setScalar(1.0);
    const sp = new THREE.Mesh(this.spikeGeo, toon("#5b4d80"));
    const band = new THREE.Mesh(this.bandGeo, this.bandMat);
    const light = new THREE.Mesh(GEO.ball, this.redOn);
    light.scale.setScalar(0.22);
    light.position.y = 0.6;
    body.add(ball, hull, sp, band, light);
    body.position.y = 0.48;
    g.add(body);
    const dmat = new THREE.MeshBasicMaterial({ map: this.dangerTex, transparent: true, depthWrite: false, opacity: 0.5 });
    const danger = new THREE.Mesh(GEO.plane, dmat);
    danger.rotation.x = -Math.PI / 2;
    danger.renderOrder = 3;
    g.visible = danger.visible = false;
    this.w.scene.add(g, danger);
    return { g, body, light, danger, dmat, used: false, x: 0, z: 0, y: 0, vy: 0, hy: 0, hv: 0, t0: 0, tl: 0, boomAt: 0, landed: false, blink: 0, on: false, notice: [0, 0, 0, 0], panic: [0, 0, 0, 0] };
  }

  private ring(x: number, y: number, z: number, r0: number, r1: number, dur: number, color: string, a0 = 0.9) {
    let r = this.rings.find((q) => !q.on);
    if (!r) {
      if (this.rings.length >= 16) return;
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
    Object.assign(r, { t: 0, dur, r0, r1, a0, on: true });
    r.m.visible = true;
  }

  private flash(x: number, z: number) {
    let f = this.flashes.find((q) => !q.on);
    if (!f) {
      if (this.flashes.length >= 4) return;
      const mat = new THREE.MeshBasicMaterial({ color: "#ffb347", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      const m = new THREE.Mesh(GEO.ball, mat);
      this.w.scene.add(m);
      f = { m, mat, t: 0, on: false };
      this.flashes.push(f);
    }
    f.m.position.set(x, 0.7, z);
    f.t = 0;
    f.on = true;
    f.m.visible = true;
  }

  // ---- spawning ----------------------------------------------------------------------------------

  /** Inside the arena's walls, `m` from them? */
  private inside(x: number, z: number, m: number) {
    if (this.L.round) return x * x + z * z <= (this.XW - m) * (this.XW - m);
    return Math.abs(x) <= this.XW - m && Math.abs(z) <= this.ZD - m;
  }

  private free(x: number, z: number, m: number) {
    if (!this.inside(x, z, m)) return false;
    for (const c of this.circles) if (Math.hypot(x - c.x, z - c.z) < c.r + m) return false;
    for (const b of this.boxes) if (Math.abs(x - b.x) < b.hx + m && Math.abs(z - b.z) < b.hz + m) return false;
    return true;
  }

  /** The ground's height at (x, z) (a sunken pool is lower). */
  private floorAt(x: number, z: number) {
    return this.L.floorAt ? this.L.floorAt(x, z) : 0;
  }
  private onIce(x: number, z: number) {
    return !!this.L.ice && within(x, z, this.L.ice.circles);
  }
  private inWet(x: number, z: number) {
    const w = this.L.wet;
    return !!w && within(x, z, w.circles, w.boxes);
  }

  /** A free spot on the stones (in this.sp). */
  private spot(m = 0.7) {
    for (let k = 0; k < 40; k++) {
      const x = (this.rnd() * 2 - 1) * (this.XW - m),
        z = (this.rnd() * 2 - 1) * (this.ZD - m);
      if (this.free(x, z, m)) return ((this.sp.x = x), (this.sp.z = z), this.sp);
    }
    return ((this.sp.x = this.L.starts[0][0] * 0.3), (this.sp.z = this.L.starts[0][1]), this.sp);
  }

  private newCoin(x: number, z: number, v: number): Coin | null {
    if (this.coins.length >= COIN_CAP) return null;
    let big: Big | null = null;
    if (v > 1) {
      big = this.bigs.find((b) => !b.used) ?? null;
      if (!big) v = 1;
      else big.used = true;
    }
    const c: Coin = { x, y: 0, z, vx: 0, vy: 0, vz: 0, st: 0, v, r: big ? BIG_R : COIN_R, g: 10, ry: this.rnd() * 6, tilt: 0, tl: 0, y0: 0, age: 0, life: 8 + this.rnd() * 1.5, ph: this.rnd() * 6, born: this.t, pickAt: 0, owner: -1, ownerT: 0, big, dead: false };
    if (big) {
      big.g.visible = big.beam.visible = big.ring.visible = true;
      big.beam.position.set(x, 12, z);
      big.ring.position.set(x, 0.04, z);
    }
    this.coins.push(c);
    return c;
  }

  /** A coin from the sky onto (x, z) (a big one: from higher, slower, everyone sees it coming). */
  private rainCoin(x: number, z: number, v = 1) {
    const c = this.newCoin(x, z, v);
    if (!c) return;
    const big = c.v > 1;
    c.y = c.y0 = big ? 20 : 14 + this.rnd() * 2.5;
    c.vy = big ? -1 : -3;
    c.g = big ? 7 : 10;
    c.life = big ? 9 : c.life;
    const h = c.y - c.r - this.floorAt(x, z),
      u = -c.vy;
    c.tl = this.t + (-u + Math.sqrt(u * u + 2 * c.g * h)) / c.g;
  }

  /** A coin flung out from (x, y, z): dropped by a stunned snark or kicked by a blast. */
  private fling(x: number, y: number, z: number, vx: number, vz: number, vy: number, owner: number, ownerFor: number) {
    const c = this.newCoin(x, z, 1);
    if (!c) return;
    Object.assign(c, { y, vx, vz, vy, st: 1, owner, ownerT: this.t + ownerFor, pickAt: this.t + 0.3, life: 6 + this.rnd() * 1.5 });
  }

  private rainBomb(x: number, z: number) {
    let b = this.bombs.find((q) => !q.used);
    if (!b) {
      if (this.bombs.length >= BOMB_CAP) return;
      b = this.makeBomb();
      this.bombs.push(b);
    }
    const y0 = 14;
    Object.assign(b, { used: true, x, z, y: y0, vy: -4, hy: 0, hv: 0, t0: this.t, landed: false, blink: 0, on: false });
    b.tl = this.t + (-4 + Math.sqrt(16 + 2 * 10 * (y0 - this.floorAt(x, z)))) / 10;
    b.boomAt = b.tl + FUSE;
    b.g.visible = b.danger.visible = true;
    b.body.scale.setScalar(1);
    b.danger.position.set(x, this.floorAt(x, z) + 0.035, z);
    b.danger.scale.set(BLAST * 2, BLAST * 2, 1);
    const fall = b.tl - this.t;
    for (let i = 0; i < 4; i++) {
      const s = this.players[i].skill;
      // a pro sees the shadow at once; a tourist may only notice it once it is down
      // (even a pro looks the other way now and then)
      b.notice[i] = this.t + 0.1 + (1 - s) * 0.8 * this.rnd() + (this.rnd() < 0.06 + (1 - s) * 0.5 ? fall * 0.9 : 0);
      b.panic[i] = this.rnd() < (1 - s) * 0.32 ? (this.rnd() - 0.5) * 2.8 : (this.rnd() - 0.5) * (1 - s) * 0.7;
    }
    beep(1500, fall * 0.95, "sine", 0.045, 0.3);
  }

  private leader() {
    let best = 0;
    for (let i = 1; i < 4; i++) if (this.score[i] > this.score[best]) best = i;
    return best;
  }

  private wave() {
    const t = this.t,
      rnd = this.rnd;
    const n = 3 + Math.floor(rnd() * 2) + (t > 11 ? 1 : 0) + (this.hurry ? 2 : 0);
    const kind = rnd();
    const pts: [number, number][] = [];
    if (kind < 0.42) for (let i = 0; i < n; i++) (this.spot(), pts.push([this.sp.x, this.sp.z]));
    else if (kind < 0.7) {
      // a clump: worth running for
      this.spot(1.6);
      const cx = this.sp.x,
        cz = this.sp.z;
      for (let i = 0; i < n + 1; i++) {
        const a = rnd() * Math.PI * 2,
          d = 0.5 + rnd() * 1.6;
        const x = cx + Math.sin(a) * d,
          z = cz + Math.cos(a) * d;
        if (this.free(x, z, 0.6)) pts.push([x, z]);
        else (this.spot(), pts.push([this.sp.x, this.sp.z]));
      }
    } else if (kind < 0.86) {
      // a row across the plaza
      let z = (rnd() * 2 - 1) * (this.ZD - 1.2);
      if (Math.abs(z) < 2.4) z = Math.sign(z || 1) * (2.4 + rnd() * 2);
      const m = n + 2;
      // (on a round plaza, a shorter row: the chord at that depth)
      const hw = this.L.round ? Math.sqrt(Math.max(4, this.XW * this.XW - z * z)) : this.XW;
      for (let i = 0; i < m; i++) {
        const x = -hw + 1.2 + ((2 * hw - 2.4) * i) / (m - 1);
        if (this.free(x, z, 0.6)) pts.push([x, z]);
      }
    } else {
      // a ring round the middle
      const m = n + 2,
        a0 = rnd() * Math.PI,
        R = this.L.ring;
      for (let i = 0; i < m; i++) {
        const a = a0 + (i / m) * Math.PI * 2,
          d = R.r - 0.15 + rnd() * 0.5;
        pts.push([R.x + Math.sin(a) * d, R.z + Math.cos(a) * d]);
      }
    }
    pts.forEach(([x, z], i) => this.pending.push({ at: t + i * 0.09 + rnd() * 0.06, x, z, k: 0 }));
    this.waveAt = t + (this.hurry ? 1.9 + rnd() * 0.4 : 3.4 - (t / HURRY_AT) * 0.6 + rnd() * 0.4);
  }

  private bombSpot() {
    const rnd = this.rnd;
    for (let k = 0; k < 12; k++) {
      let x: number, z: number;
      const roll = rnd();
      const heap = roll > 0.62 && roll < 0.9 ? this.heap() : null;
      if (heap) {
        // a rug pull: right among the coins
        x = heap.x + (rnd() - 0.5) * 1.2;
        z = heap.z + (rnd() - 0.5) * 1.2;
      } else if (roll < (this.hurry ? 0.55 : 0.45)) {
        // near somebody (the leader most of all)
        const j = rnd() < 0.5 ? this.leader() : Math.floor(rnd() * 4);
        const a = rnd() * Math.PI * 2,
          d = 0.4 + rnd() * 1.5;
        const p = this.run[j].a.pos;
        x = p.x + Math.sin(a) * d;
        z = p.z + Math.cos(a) * d;
      } else {
        this.spot(0.8);
        ((x = this.sp.x), (z = this.sp.z));
      }
      if (!this.free(x, z, 0.7)) continue;
      // (never two on the same spot)
      if (this.bombs.some((b) => b.used && Math.hypot(b.x - x, b.z - z) < 2.6)) continue;
      this.pending.push({ at: this.t + rnd() * 0.15, x, z, k: 2 });
      return;
    }
  }

  /** The landed coin with the most others round it (null if none). */
  private heap() {
    let best: Coin | null = null,
      bn = 1;
    for (const c of this.coins) {
      if (c.st === 0 || c.v > 1) continue;
      let n = 0;
      for (const k of this.coins) if (k.st !== 0 && Math.abs(k.x - c.x) < 2 && Math.abs(k.z - c.z) < 2) n++;
      if (n > bn) ((bn = n), (best = c));
    }
    return best;
  }

  private spawn() {
    const t = this.t,
      rnd = this.rnd;
    if (!this.hurry && t >= HURRY_AT) {
      this.hurry = true;
      music.rate(1.15);
      this.say(T("HURRY!", "快！"), "#ff5a3c", 1.6, 70);
      sfx.star();
      beep(660, 0.1, "square", 0.25, 0, 0.35);
      beep(880, 0.18, "square", 0.25, 0, 0.45);
      this.cam.shake(0.25);
      // a downpour to open the rush
      for (let i = 0; i < 9; i++) (this.spot(), this.pending.push({ at: t + 0.2 + i * 0.07, x: this.sp.x, z: this.sp.z, k: 0 }));
      this.waveAt = t + 1.2;
      this.bombAt = Math.min(this.bombAt, t + 0.9);
    }
    if (t >= this.waveAt) this.wave();
    // and between the waves, a steady drizzle
    if (t >= this.rainAt) {
      this.spot();
      this.pending.push({ at: t, x: this.sp.x, z: this.sp.z, k: 0 });
      this.rainAt = t + (this.hurry ? 0.5 : 1.05 - (t / HURRY_AT) * 0.25) * (0.6 + rnd() * 0.8);
    }
    if (t >= this.bombAt) {
      const n = this.hurry && rnd() < 0.45 ? 2 : 1;
      for (let i = 0; i < n; i++) this.bombSpot();
      this.bombAt = t + (this.hurry ? 1.1 + rnd() * 0.45 : 3.1 - (t / HURRY_AT) * 1.1 + rnd() * 0.5);
    }
    if (this.bigI < this.bigTimes.length && t >= this.bigTimes[this.bigI]) {
      this.bigI++;
      // somewhere nobody stands, in the open middle of the plaza (never under a corner panel): a race
      let ok = false;
      for (let k = 0; k < 40 && !ok; k++) {
        this.spot(1.2);
        ok = Math.abs(this.sp.x) < 7 && Math.abs(this.sp.z) < 4.2 && this.run.every((r) => Math.hypot(r.a.pos.x - this.sp.x, r.a.pos.z - this.sp.z) > 3.2);
      }
      this.pending.push({ at: t, x: this.sp.x, z: this.sp.z, k: 1 });
      this.say(T("BIG COIN!", "大金币！"), "#ffd23f", 1.4, 60);
      [1046, 1318, 1568, 2093].forEach((f, i) => beep(f, 0.16, "triangle", 0.3, 0, i * 0.07));
    }
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      if (t < p.at) continue;
      if (p.k === 2) this.rainBomb(p.x, p.z);
      else this.rainCoin(p.x, p.z, p.k === 1 ? 5 : 1);
      this.pending[i] = this.pending[this.pending.length - 1];
      this.pending.pop();
    }
    const left = Math.ceil(TIME - t);
    if (left <= 5 && left > 0 && left !== this.lastTick) ((this.lastTick = left), sfx.tick());
  }

  /** The level's twists: the gusts (warned, then blowing), the fountain's thaw (cracking, then bursting). */
  private twists(dt: number) {
    const t = this.t,
      wx = this.wx;
    const G = this.L.gust;
    if (G) {
      if (this.gustPh === 0 && t >= this.gustAt && t < TIME - 1.6) {
        this.gustPh = 1;
        this.gustT = 0;
        wx.dir = this.rnd() < 0.5 ? -1 : 1;
        this.say(wx.dir > 0 ? T("GUST ▶▶", "阵风 ▶▶") : T("◀◀ GUST", "◀◀ 阵风"), "#9fe8ff", G.warn + 0.35, 56);
        // a rising howl
        beep(200, G.warn, "sawtooth", 0.035, 2.4);
        beep(300, G.warn, "triangle", 0.05, 2.0);
      } else if (this.gustPh === 1) {
        this.gustT += dt;
        wx.warn = Math.min(1, this.gustT / G.warn);
        if (this.gustT >= G.warn) {
          this.gustPh = 2;
          this.gustT = 0;
          wx.warn = 0;
          this.cam.shake(0.2);
          gale(G.len + 0.3, 0.55);
        }
      } else if (this.gustPh === 2) {
        this.gustT += dt;
        const k = Math.max(0, Math.min(1, this.gustT / 0.3, (G.len - this.gustT) / 0.5));
        wx.wind = wx.dir * k * (this.hurry ? 1.2 : 1);
        if (this.gustT >= G.len) {
          this.gustPh = 0;
          wx.wind = 0;
          // (the rush: they come quicker)
          this.gustAt = t + (this.hurry ? 0.7 : 1) * (G.every[0] + this.rnd() * (G.every[1] - G.every[0]));
        }
      }
    }
    const F = this.L.thaw;
    if (F) {
      if (this.thawPh === 0 && t >= this.thawAt && t < TIME - 1.8) {
        this.thawPh = 1;
        this.thawT = 0;
        this.say(T("THAW!", "解冻！"), "#ffb35a", F.warn + 0.2, 54);
        beep(70, F.warn, "sawtooth", 0.06, 1.8);
      } else if (this.thawPh === 1) {
        const was = this.thawT;
        this.thawT += dt;
        wx.thaw = Math.min(1, this.thawT / F.warn);
        // the ice cracks, quicker and quicker; a ring pulses where the burst will throw you
        const beat = (k: number) => Math.floor(Math.pow(k, 1.8) * 9);
        if (beat(this.thawT / F.warn) !== beat(was / F.warn)) {
          beep(900 + wx.thaw * 900, 0.05, "square", 0.12);
          this.ring(F.x, this.floorAt(F.x, F.z) + 0.07, F.z, F.r + 0.1, F.r + 1.35, 0.32, "#ffa040", 0.95);
          this.cam.shake(0.04 + wx.thaw * 0.06);
        }
        if (this.thawT >= F.warn) {
          this.thawPh = 0;
          wx.thaw = 0;
          wx.burst = true;
          this.erupt();
          this.thawAt = t + (this.hurry ? 0.65 : 1) * (F.every[0] + this.rnd() * (F.every[1] - F.every[0]));
        }
      }
    }
  }

  /** The frozen fountain bursts: a ring of coins flung over the ice, whoever hugs it thrown back. */
  private erupt() {
    const F = this.L.thaw!;
    const n = F.n + (this.hurry ? 3 : 0);
    const a0 = this.rnd() * Math.PI * 2;
    const y = this.floorAt(F.x, F.z) + 2.2;
    for (let k = 0; k < n; k++) {
      const a = a0 + (k / n) * Math.PI * 2 + (this.rnd() - 0.5) * 0.35;
      const sp = 2.6 + this.rnd() * 3.0;
      this.fling(F.x + Math.sin(a) * F.r * 0.5, y, F.z + Math.cos(a) * F.r * 0.5, Math.sin(a) * sp, Math.cos(a) * sp, 7 + this.rnd() * 2.5, -1, 0);
    }
    for (let i = 0; i < 4; i++) {
      const r = this.run[i],
        p = r.a.pos;
      const dx = p.x - F.x,
        dz = p.z - F.z;
      const d = Math.hypot(dx, dz);
      if (d > F.r + 1.3 || r.stun > 0) continue;
      const nx = d > 0.05 ? dx / d : Math.sin(i * 2.3),
        nz = d > 0.05 ? dz / d : Math.cos(i * 2.3);
      r.stun = 0.4;
      r.dash = 0;
      r.rec = 0;
      r.vx = nx * 7.5;
      r.vz = nz * 7.5;
      r.spin = 7 * (this.rnd() < 0.5 ? -1 : 1);
      r.a.vy = 5.5;
      r.a.grounded = false;
      r.a.hit();
      r.tgt = null;
      if (isLocal(this.players[i])) sfx.hit();
    }
    const at = this.v.set(F.x, this.floorAt(F.x, F.z) + 1.6, F.z);
    this.fx.burst(at, 40, ["#ffffff", "#c9f3ff", "#8fe8ff", "#e6fbff"], { speed: 7, up: 8, size: 0.24, life: 0.9, gravity: 16 });
    this.fx.burst(at, 10, ["#ffffff", "#eef6ff"], { speed: 3, up: 4, size: 0.34, life: 0.9, gravity: -1.5, drag: 2.5 });
    this.ring(F.x, this.floorAt(F.x, F.z) + 0.08, F.z, F.r, F.r + 3.4, 0.5, "#bff4ff", 1);
    this.cam.shake(0.32);
    boom(0.45);
    [784, 1046, 1318, 1568].forEach((f, i) => beep(f, 0.12, "triangle", 0.22, 0, 0.05 + i * 0.05));
  }

  /** How far the wind will have pushed a falling coin sideways by `dt` seconds from now (what a pro reads). */
  private windAhead(dt: number) {
    const G = this.L.gust;
    if (!G || dt <= 0) return 0;
    if (this.gustPh === 2) return this.wx.wind * G.drift * Math.max(0, Math.min(dt, G.len - this.gustT));
    if (this.gustPh === 1) return this.wx.dir * G.drift * Math.max(0, Math.min(dt - (G.warn - this.gustT), G.len - 0.4));
    return 0;
  }

  private say(s: string, c: string, dur = 1.5, size = 58) {
    this.banners.push({ s, c, t: this.clk, dur, size });
  }

  // ---- the phases --------------------------------------------------------------------------------

  /**
   * The play camera (in this.eye/at): three-quarter, over the plaza, leaning toward `seat` a little
   * (you, by default). Online it also turns each person's stick: where their own camera aims.
   */
  private playCam(seat = this.you) {
    let hx = 0,
      hz = 0;
    if (seat >= 0) {
      const p = this.run[seat].a.pos;
      hx = clamp(p.x, -7, 7);
      hz = clamp(p.z, -5, 5);
    }
    const C = this.L.cam;
    this.eye.set(hx * 0.3, C.h, C.d + hz * 0.16);
    this.at.set(hx * 0.4, 0, 0.6 + hz * 0.28);
  }

  /**
   * A touch screen: the camera slides a little further toward you when you are down in a front
   * corner, so you never run under your own thumbs (the stick left, the button right). A slide of the
   * eye and its aim together: the way the stick's "up" points does not change.
   */
  private thumbCam() {
    if (!HUD.thumbs || this.you < 0) return;
    const p = this.run[this.you].a.pos;
    const k = clamp((p.z + 1.5) / 5, 0, 1) * clamp(p.x / 6, -1, 1) * 1.3;
    this.eye.x += k;
    this.at.x += k;
  }

  idle(dt: number, phase: "card" | "count", k: number) {
    this.phase = phase;
    this.clk += dt;
    if (phase === "card") this.cam.orbit(this.v.set(0, 0, -1), -0.62 + k * 0.16, 23, 12);
    else {
      this.playCam();
      this.thumbCam();
      this.cam.to(this.eye, this.at, dt, 3.4);
    }
    this.cam.apply(dt);
    for (const r of this.run) {
      r.a.physics(dt, 0);
      r.a.sync(dt);
    }
    this.animate(dt);
  }

  update(dt: number, input: Input) {
    this.phase = "play";
    this.clk += dt;
    this.wx.burst = false;
    if (!this.over) {
      this.t += dt;
      this.wx.t = this.t;
      this.spawn();
      this.twists(dt);
      if (this.t >= TIME) this.finish();
    } else {
      this.post += dt;
      this.wx.wind *= Math.exp(-3 * dt);
    }
    // the moves, then the bumps between them, then the walls
    for (let i = 0; i < 4; i++) this.move(i, dt, input);
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
    this.tickBombs(dt);
    this.animate(dt);
    if (!this.over) this.pickups();
    // the camera: the game's own; at the end, down on the winner
    if (this.over) {
      const p = this.run[this.over[0]].a.pos;
      // (the winner low in the frame: the FINISH! banner goes over the middle)
      this.eye.set(p.x * 0.85, 6.6, p.z + 8.6);
      this.at.set(p.x * 0.95, 2.5, p.z - 2.2);
      this.cam.to(this.eye, this.at, dt, 3.2, 5);
    } else {
      this.playCam();
      this.thumbCam();
      this.cam.to(this.eye, this.at, dt, 2.6);
    }
    this.cam.apply(dt);
    for (let i = 0; i < 4; i++) {
      this.bump[i] = Math.max(0, this.bump[i] - dt * 3.2);
      this.loss[i] = Math.max(0, this.loss[i] - dt * 2.2);
    }
    this.hurt = Math.max(0, this.hurt - dt * 1.8);
    this.gold = Math.max(0, this.gold - dt * 2.5);
  }

  private finish() {
    const tie = this.score.map((s, i) => -(this.reach[i][s] ?? 0));
    this.over = rankBy(this.score, tie);
    this.pending.length = 0;
    const win = this.run[this.over[0]];
    win.a.cheer(3);
    win.a.jump(9);
    win.jumpAt = 0.9;
    this.run[this.over[3]].angryT = 9;
    // (no gust, no thaw on the way any more)
    this.gustPh = this.thawPh = 0;
    this.wx.warn = this.wx.thaw = 0;
    // the bombs left fizzle out
    for (const b of this.bombs)
      if (b.used) {
        b.used = false;
        b.g.visible = b.danger.visible = false;
        this.fx.burst(this.v.set(b.x, b.y + 0.5, b.z), 12, ["#bdb6cc", "#ffffff", "#8a82a0"], { speed: 3, up: 3, size: 0.3, gravity: -1, life: 0.8, drag: 2 });
      }
  }

  // ---- the players -------------------------------------------------------------------------------

  private move(i: number, dt: number, input: Input) {
    const r = this.run[i],
      a = r.a,
      P = this.players[i];
    r.cd -= dt;
    r.immune -= dt;
    let mx = 0,
      mz = 0,
      dash = false,
      ddx = 0,
      ddz = 0;
    if (!this.over && r.stun <= 0) {
      if (P.human) {
        const inp = inputOf(P, input);
        const ax = inp.axis();
        // screen-relative: "up" runs away from the camera (online: the camera this seat's own screen
        // aims, from the sim's state alone; the eased one differs from one client to the next)
        let fx: number, fz: number;
        if (P.input) {
          this.playCam(i);
          ((fx = this.at.x - this.eye.x), (fz = this.at.z - this.eye.z));
        } else ((fx = this.cam.at.x - this.cam.eye.x), (fz = this.cam.at.z - this.cam.eye.z));
        const fl = Math.hypot(fx, fz) || 1;
        ((fx /= fl), (fz /= fl));
        mx = -fz * ax.x - fx * ax.y;
        mz = fx * ax.x - fz * ax.y;
        const l = Math.hypot(mx, mz);
        if (l > 1) ((mx /= l), (mz /= l));
        if (inp.pressed("a")) r.buf = 0.18;
        r.buf -= dt;
        if (r.buf > 0) {
          dash = true;
          if (l > 0.1) ((ddx = mx / Math.max(l, 1e-3)), (ddz = mz / Math.max(l, 1e-3)));
          else ((ddx = Math.sin(a.yaw)), (ddz = Math.cos(a.yaw)));
        }
      } else {
        this.brain(i, dt);
        ((mx = this.mx), (mz = this.mz), (dash = this.wantDash), (ddx = this.ddx), (ddz = this.ddz));
      }
    }
    const ice = this.onIce(a.pos.x, a.pos.z);
    if (r.stun > 0) {
      r.stun -= dt;
      // (on the ice, a snark knocked down slides on)
      const k = Math.exp(-(a.grounded ? (ice ? 1.1 : 5) : 0.4) * dt);
      r.vx *= k;
      r.vz *= k;
      if (r.stun <= 0) ((r.immune = IMMUNE), (r.spin = 0));
    } else if (r.dash > 0) {
      r.dash -= dt;
      if (r.dash <= 0) r.rec = RECOVER;
      // a dive into somebody: they lose a coin
      for (let j = 0; j < 4; j++) {
        if (j === i) continue;
        const o = this.run[j];
        if (o.stun > 0 || o.immune > 0) continue;
        if (Math.hypot(o.a.pos.x - a.pos.x, o.a.pos.z - a.pos.z) < 1.0 && Math.abs(o.a.pos.y - a.pos.y) < 1.2) {
          this.tackle(i, j);
          break;
        }
      }
    } else {
      if (dash && r.cd <= 0 && a.grounded) {
        this.stats.dives++;
        r.buf = 0;
        r.dash = DASH_T;
        r.cd = DASH_CD;
        r.dx = ddx;
        r.dz = ddz;
        r.vx = ddx * DASH_V;
        r.vz = ddz * DASH_V;
        a.yaw = yawOf(ddx, ddz);
        a.vy = 3.4;
        a.grounded = false;
        this.fx.burst(this.v.set(a.pos.x, a.pos.y + 0.15, a.pos.z), 8, ice ? ["#ffffff", "#c9f3ff"] : this.L.dust, { speed: 2.5, up: 1.2, size: 0.16, gravity: 4, life: 0.4, drag: 3 });
        if (isLocal(P)) sfx.whoosh();
      } else {
        // (wading through the pool or a puddle: slower; on the ice: no grip, a slide)
        const wet = this.L.wet && this.inWet(a.pos.x, a.pos.z);
        const sp = SPEED * (r.rec > 0 ? 0.35 : 1) * (wet ? this.L.wet!.k : 1);
        const k = 1 - Math.exp(-(ice ? this.L.ice!.grip : 14) * dt);
        r.vx += (mx * sp - r.vx) * k;
        r.vz += (mz * sp - r.vz) * k;
        if (wet && a.grounded && (mx || mz) && Math.random() < dt * 9) this.fx.burst(this.v.set(a.pos.x, 0.05, a.pos.z), 3, ["#bfe9ff", "#ffffff", "#7fc8ff"], { speed: 1.6, up: 2.2, size: 0.1, gravity: 12, life: 0.35 });
        if (ice && a.grounded && Math.hypot(r.vx, r.vz) > 3 && Math.random() < dt * 6) this.fx.burst(this.v.set(a.pos.x, a.pos.y + 0.05, a.pos.z), 1, ["#ffffff", "#dff6ff"], { speed: 0.8, up: 0.6, size: 0.09, gravity: 3, life: 0.4 });
        // (a puff of dust, or of snow, at the heels of a snark at full run)
        else if (!wet && a.grounded && Math.hypot(r.vx, r.vz) > 4.5 && Math.random() < dt * 4) this.fx.burst(this.v.set(a.pos.x - r.vx * 0.04, a.pos.y + 0.08, a.pos.z - r.vz * 0.04), 2, this.L.dust, { speed: 0.9, up: 0.9, size: 0.12, gravity: 1.5, life: 0.45, drag: 3 });
      }
      r.rec -= dt;
    }
    a.pos.x += r.vx * dt;
    a.pos.z += r.vz * dt;
    // the gust pushes everyone downwind
    if (this.wx.wind && this.L.gust) a.pos.x += this.wx.wind * this.L.gust.push * dt;
    if (!this.over) this.stats.seat[i].dist += Math.hypot(r.vx, r.vz) * dt;
  }

  /** The walls, the props, the floor; the pose. */
  private place(i: number, dt: number) {
    const r = this.run[i],
      a = r.a,
      p = a.pos;
    if (this.L.round) {
      // the round plaza's rim
      const lr = this.XW - PR;
      const d = Math.hypot(p.x, p.z);
      if (d > lr) {
        const nx = p.x / d,
          nz = p.z / d;
        p.x = nx * lr;
        p.z = nz * lr;
        const vn = r.vx * nx + r.vz * nz;
        if (vn > 0) ((r.vx -= vn * nx * 1.3), (r.vz -= vn * nz * 1.3));
      }
    } else {
      const lx = this.XW - PR,
        lz = this.ZD - PR;
      if (p.x > lx) ((p.x = lx), r.vx > 0 && (r.vx *= -0.3));
      if (p.x < -lx) ((p.x = -lx), r.vx < 0 && (r.vx *= -0.3));
      if (p.z > lz) ((p.z = lz), r.vz > 0 && (r.vz *= -0.3));
      if (p.z < -lz) ((p.z = -lz), r.vz < 0 && (r.vz *= -0.3));
    }
    for (const c of this.circles) {
      const dx = p.x - c.x,
        dz = p.z - c.z;
      const d = Math.hypot(dx, dz),
        m = c.r + PR;
      if (d < m && d > 1e-4) {
        const nx = dx / d,
          nz = dz / d;
        p.x = c.x + nx * m;
        p.z = c.z + nz * m;
        const vn = r.vx * nx + r.vz * nz;
        if (vn < 0) ((r.vx -= vn * nx * 1.2), (r.vz -= vn * nz * 1.2));
      }
    }
    for (const b of this.boxes) {
      const cx = clamp(p.x, b.x - b.hx, b.x + b.hx),
        cz = clamp(p.z, b.z - b.hz, b.z + b.hz);
      let dx = p.x - cx,
        dz = p.z - cz;
      let d = Math.hypot(dx, dz);
      if (d >= PR) continue;
      if (d < 1e-4) {
        // inside: out the nearest side
        const ox = b.hx - Math.abs(p.x - b.x),
          oz = b.hz - Math.abs(p.z - b.z);
        if (ox < oz) ((dx = Math.sign(p.x - b.x) || 1), (dz = 0));
        else ((dx = 0), (dz = Math.sign(p.z - b.z) || 1));
        d = 1;
        p.x = ox < oz ? b.x + dx * (b.hx + PR) : p.x;
        p.z = ox < oz ? p.z : b.z + dz * (b.hz + PR);
      } else {
        p.x = cx + (dx / d) * PR;
        p.z = cz + (dz / d) * PR;
      }
      const nx = dx / d,
        nz = dz / d;
      const vn = r.vx * nx + r.vz * nz;
      if (vn < 0) ((r.vx -= vn * nx * 1.2), (r.vz -= vn * nz * 1.2));
    }
    a.physics(dt, this.floorAt(p.x, p.z));
    // the winner's hops at the end
    if (this.over && i === this.over[0]) {
      r.jumpAt -= dt;
      if (r.jumpAt <= 0 && a.grounded) ((r.jumpAt = 0.75), a.jump(8.5));
    }
    const sp = Math.hypot(r.vx, r.vz);
    if (r.stun > 0) {
      a.yaw += r.spin * dt;
      r.spin *= Math.exp(-2.5 * dt);
    } else if (sp > 0.6) a.face(yawOf(r.vx, r.vz), dt, r.dash > 0 ? 30 : 15);
    a.legs = r.stun > 0 ? 0 : null;
    r.angryT -= dt;
    a.angry = r.angryT > 0;
    const lean = r.dash > 0 ? 0.75 : r.rec > 0 ? 0.45 : 0;
    r.lean += (lean - r.lean) * Math.min(1, 20 * dt);
    a.body.root.rotation.x = r.lean;
    r.sq = Math.max(0, r.sq - dt * 6);
    const q = Math.sin(r.sq * Math.PI) * 0.16;
    a.body.root.scale.set(1 + q, 1 - q * 0.8, 1 + q);
    a.sync(dt);
    // dizzy stars
    r.stars.visible = r.stun > 0;
    if (r.stun > 0) {
      r.stars.position.set(p.x, p.y + 1.95 * SIZE, p.z);
      r.stars.rotation.y += dt * 7;
    }
    // blinking while it can't be hit
    a.body.root.visible = !(r.immune > 0 && Math.floor(this.clk * 15) % 3 === 0);
  }

  private tackle(i: number, j: number) {
    this.stats.tackles++;
    this.stats.seat[i].tackler++;
    this.stats.seat[j].tackled++;
    const r = this.run[i],
      o = this.run[j];
    o.stun = STUN_TACKLE;
    o.dash = 0;
    o.rec = 0;
    o.vx = r.dx * 7.5;
    o.vz = r.dz * 7.5;
    o.spin = 6 * (this.rnd() < 0.5 ? -1 : 1);
    o.a.vy = 4.5;
    o.a.grounded = false;
    o.a.hit();
    r.vx *= 0.2;
    r.vz *= 0.2;
    r.dash = 0;
    r.rec = 0.32;
    const mx = (r.a.pos.x + o.a.pos.x) / 2,
      mz = (r.a.pos.z + o.a.pos.z) / 2;
    this.fx.burst(this.v.set(mx, 1.0, mz), 18, ["#ffffff", "#ffe14a", this.players[j].color], { speed: 6, up: 3, size: 0.2, life: 0.55, gravity: 10 });
    this.ring(mx, 1.0, mz, 0.3, 1.6, 0.3, "#ffffff", 0.9);
    sfx.hit();
    this.cam.shake(i === this.you || j === this.you ? 0.3 : 0.15);
    if (this.score[j] > 0) {
      this.score[j]--;
      this.loss[j] = 1;
      const an = Math.atan2(r.dx, r.dz) + (this.rnd() - 0.5) * 1.2;
      this.fling(o.a.pos.x, 1.2, o.a.pos.z, Math.sin(an) * 4.5, Math.cos(an) * 4.5, 7.5, j, 1.0);
      this.pop(j, "-1", "#ff5a6a");
    }
    if (!this.players[j].human) ((o.revenge = i), (o.revengeT = this.t + 4));
    o.angryT = 2;
  }

  // ---- the AI ------------------------------------------------------------------------------------

  /** The time for seat i to get to (x, z). */
  private eta(i: number, x: number, z: number) {
    const p = this.run[i].a.pos;
    const sf = this.players[i].human ? 1 : 0.8 + 0.17 * this.players[i].skill;
    return Math.hypot(x - p.x, z - p.z) / (SPEED * sf) + (this.run[i].stun > 0 ? this.run[i].stun : 0);
  }

  /** Would seat i be standing in a known blast at (x, z) when it gets there, in `eff` seconds? */
  private risky(i: number, x: number, z: number, eff: number) {
    const s = this.players[i].skill;
    for (const b of this.bombs) {
      if (!b.used || this.t < b.notice[i]) continue;
      // (a tourist does not read the shadows: only a bomb already down, and smaller than it is)
      if (s < 0.45 && !b.landed) continue;
      if (Math.hypot(x - b.x, z - b.z) > BLAST * (0.75 + 0.3 * s) + 0.3) continue;
      const left = b.boomAt - this.t;
      if (left > eff - 0.3 && left < eff + 0.9) return true;
    }
    return false;
  }

  private brain(i: number, dt: number) {
    const r = this.run[i],
      a = r.a,
      s = this.players[i].skill,
      t = this.t;
    this.mx = this.mz = 0;
    this.wantDash = false;
    // 1. a bomb about to blow near me: out of there
    let fx = 0,
      fz = 0,
      urgent = Infinity,
      worst: object | null = null;
    // (on the ice it takes longer to get going: a pro leaves sooner)
    const ice = this.L.ice && this.onIce(a.pos.x, a.pos.z) ? 0.2 + 0.3 * s : 0;
    for (const b of this.bombs) {
      if (!b.used || t < b.notice[i]) continue;
      const left = b.boomAt - t;
      if (left > 0.25 + s * 0.85 + ice) continue;
      const dx = a.pos.x - b.x,
        dz = a.pos.z - b.z;
      const d = Math.hypot(dx, dz);
      // (a tourist thinks the blast smaller than it is)
      const R = BLAST * (0.68 + 0.32 * s) + 0.25;
      if (d > R) continue;
      let nx = d > 0.05 ? dx / d : Math.sin(i * 2.1),
        nz = d > 0.05 ? dz / d : Math.cos(i * 2.1);
      // (a tourist in a panic runs any which way)
      const pa = b.panic[i];
      if (pa) {
        const c = Math.cos(pa),
          sn = Math.sin(pa);
        [nx, nz] = [nx * c - nz * sn, nx * sn + nz * c];
      }
      const w = (R - d) / R + 0.4;
      fx += nx * w;
      fz += nz * w;
      if (left < urgent) ((urgent = left), (worst = b));
    }
    // the thawing fountain about to throw whoever hugs it: a pro steps back in time
    const F = this.L.thaw;
    if (F && this.thawPh === 1 && !worst) {
      const left = F.warn - this.thawT;
      const dx = a.pos.x - F.x,
        dz = a.pos.z - F.z;
      const d = Math.hypot(dx, dz);
      if (left < 0.15 + s * 0.75 + ice && d < F.r + 1.45 && this.rnd() < 0.3 + s * 0.7) {
        fx = dx / (d || 1);
        fz = dz / (d || 1);
        urgent = left;
        worst = this.thawMark;
      }
    }
    const g = r.tgt;
    if (worst && r.greedy && g && !g.dead && urgent > 0.22 && Math.hypot(g.x - a.pos.x, g.z - a.pos.z) < 2.6) worst = null;
    if (worst) {
      const l = Math.hypot(fx, fz) || 1;
      ((fx /= l), (fz /= l));
      // along a wall rather than into it
      const p = a.pos;
      if (this.L.round) {
        // (round the rim, not into it)
        const d = Math.hypot(p.x, p.z) || 1;
        const nx = p.x / d,
          nz = p.z / d;
        const out = fx * nx + fz * nz;
        if (d > this.XW - 1.6 && out > 0) {
          fx -= out * nx;
          fz -= out * nz;
          const tl = Math.hypot(fx, fz);
          if (tl < 0.2) ((fx = -nz * (i % 2 ? 1 : -1)), (fz = nx * (i % 2 ? 1 : -1)));
        }
      } else {
        if ((p.x > this.XW - 1.4 && fx > 0) || (p.x < -this.XW + 1.4 && fx < 0)) ((fz += Math.sign(fz || -p.z || 1) * 0.8), (fx = 0));
        if ((p.z > this.ZD - 1.4 && fz > 0) || (p.z < -this.ZD + 1.4 && fz < 0)) ((fx += Math.sign(fx || -p.x || 1) * 0.8), (fz = 0));
      }
      const l2 = Math.hypot(fx, fz) || 1;
      ((fx /= l2), (fz /= l2));
      this.steer(i, p.x + fx * 3, p.z + fz * 3, s, false);
      // a pro dives out when it is about to go
      if (r.escFor !== worst) ((r.escFor = worst), (r.escDive = this.rnd() < s * 0.75));
      if (r.escDive && urgent < 0.45 && r.cd <= 0) ((this.wantDash = true), (this.ddx = fx), (this.ddz = fz), (r.escDive = false));
      r.tgt = null;
      r.think = Math.min(r.think, 0.1);
      return;
    }
    // 2. think: which coin, a dive at somebody
    r.think -= dt;
    if (r.think <= 0) {
      r.think = 0.44 - s * 0.3 + this.rnd() * 0.08;
      this.choose(i);
      this.plotTackle(i);
    }
    if (r.pause > 0) {
      r.pause -= dt;
      return;
    }
    let tx = r.tx,
      tz = r.tz;
    if (r.tgt) {
      if (r.tgt.dead) {
        r.tgt = null;
        r.think = Math.min(r.think, 0.04 + (1 - s) * 0.2);
      } else {
        tx = r.tgt.x;
        tz = r.tgt.z;
        // (a pro reads the gust: where the coin will land, not where it is)
        if (this.L.gust && r.tgt.st === 0) tx = clamp(tx + this.windAhead(r.tgt.tl - t) * (0.45 + 0.35 * s), -this.XW + 0.5, this.XW - 0.5);
      }
    } else if (F && this.thawPh === 1 && this.rnd() < dt * (0.8 + s * 0.6)) {
      // nothing to grab: wait by the fountain for its burst (out of its reach)
      const dx = a.pos.x - F.x,
        dz = a.pos.z - F.z;
      const d = Math.hypot(dx, dz) || 1;
      r.tx = F.x + (dx / d) * (F.r + 2.1);
      r.tz = F.z + (dz / d) * (F.r + 2.1);
      r.wanderAt = t + 1.2;
    }
    this.steer(i, tx, tz, s, !!r.tgt);
    if (r.want) {
      r.want = false;
      if (r.cd <= 0) ((this.wantDash = true), (this.ddx = r.wdx), (this.ddz = r.wdz));
    }
  }

  private choose(i: number) {
    const r = this.run[i],
      a = r.a,
      s = this.players[i].skill,
      t = this.t;
    let best: Coin | null = null,
      bs = 0,
      second: Coin | null = null,
      ss = 0;
    for (const c of this.coins) {
      if (c.dead || (c.owner === i && t < c.ownerT)) continue;
      const fall = c.st === 0;
      // a tourist only sees what is about to land; a pro reads the shadows
      if (fall && (c.tl - t > 0.35 + s * s * 1.4 || t - c.born < (1 - s) * 0.8 * ((c.ph * 7.3 + i * 0.37) % 1))) continue;
      const eff = Math.max(this.eta(i, c.x, c.z), fall ? c.tl - t : 0, c.pickAt - t);
      if (c.st === 2 && c.life - c.age < eff) continue;
      if (!r.greedy && this.risky(i, c.x, c.z, eff)) continue;
      let sc = c.v / (eff + 0.45);
      // somebody gets there first
      for (let j = 0; j < 4; j++) {
        if (j === i || this.run[j].stun > 0.3) continue;
        if (this.eta(j, c.x, c.z) + 0.12 < eff) sc *= 0.3 + 0.5 * (1 - s);
      }
      // a clump is worth the trip (to those who look)
      if (s > 0.4)
        for (const k of this.coins)
          if (k !== c && !k.dead && k.st !== 0 && Math.abs(k.x - c.x) < 1.8 && Math.abs(k.z - c.z) < 1.8) sc += (k.v * 0.3 * s) / (eff + 0.45);
      if (c === r.tgt) sc *= 1.3;
      if (sc > bs) ((second = best), (ss = bs), (best = c), (bs = sc));
      else if (sc > ss) ((second = c), (ss = sc));
    }
    r.greedy = this.rnd() < 0.1 + (1 - s) * 0.45;
    const prev = r.tgt;
    r.tgt = second && this.rnd() < (1 - s) * 0.2 ? second : best;
    // (a tourist stops a moment to look after a grab)
    if (prev && prev.dead && r.tgt && this.rnd() < (1 - s) * 0.5) r.pause = 0.1 + (1 - s) * 0.3 * this.rnd();
    if (!r.tgt && t > r.wanderAt) {
      r.wanderAt = t + 1 + this.rnd();
      // nothing about: drift to open ground near the middle
      this.spot(1.2);
      r.tx = this.sp.x * 0.6 + a.pos.x * 0.2;
      r.tz = this.sp.z * 0.6 + a.pos.z * 0.2;
    }
  }

  private plotTackle(i: number) {
    const r = this.run[i],
      a = r.a,
      s = this.players[i].skill,
      t = this.t;
    if (r.cd > 0 || r.rec > 0 || t < 2 || t < r.tackleAt) return;
    let lead = 0;
    for (const v of this.score) lead = Math.max(lead, v);
    for (let j = 0; j < 4; j++) {
      if (j === i) continue;
      const o = this.run[j];
      if (this.score[j] <= 0 || o.stun > 0 || o.immune > 0) continue;
      const dx = o.a.pos.x - a.pos.x,
        dz = o.a.pos.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 2.7 || d < 0.5) continue;
      let want = 0;
      if (this.score[j] === lead && lead > this.score[i]) want += 1;
      if (this.score[j] >= this.score[i] + 3) want += 0.4;
      if (r.revenge === j && t < r.revengeT) want += 0.8;
      if (!want) continue;
      let p = s * 0.5 * want;
      // (an easy table goes easy on you)
      if (this.players[j].human) p *= 0.3 + 0.7 * s;
      if (this.rnd() >= p) continue;
      // lead the target (a pro aims better)
      const lx = dx + o.vx * 0.15,
        lz = dz + o.vz * 0.15;
      const an = Math.atan2(lx, lz) + (this.rnd() - 0.5) * (1 - s) * 0.6;
      ((r.want = true), (r.wdx = Math.sin(an)), (r.wdz = Math.cos(an)));
      r.tackleAt = t + 2.4 - s;
      return;
    }
    // a dive for a big coin somebody else wants too
    const c = r.tgt;
    if (c && c.v > 1 && c.st !== 0 && s > 0.35) {
      const dx = c.x - a.pos.x,
        dz = c.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 2.2 && d < 4.5 && this.rnd() < s) ((r.want = true), (r.wdx = dx / d), (r.wdz = dz / d), (r.tackleAt = t + 1.5));
    }
  }

  /** Toward (tx, tz) round the props, a little wobbly when not so good (sets this.mx/mz). */
  private steer(i: number, tx: number, tz: number, s: number, coinish: boolean) {
    const p = this.run[i].a.pos;
    let dx = tx - p.x,
      dz = tz - p.z;
    const d = Math.hypot(dx, dz);
    if (d < (coinish ? 0.05 : 0.3)) return;
    let nx = dx / d,
      nz = dz / d;
    for (const o of this.avoid) {
      const ox = o.x - p.x,
        oz = o.z - p.z;
      const along = ox * nx + oz * nz;
      if (along < 0 || along > Math.min(d + o.r, 3.5)) continue;
      const side = -ox * nz + oz * nx;
      const clear = o.r + PR + 0.25;
      if (Math.abs(side) >= clear) continue;
      const sg = Math.abs(side) < 0.05 ? (i % 2 ? 1 : -1) : Math.sign(side);
      const k = ((clear - Math.abs(side)) / clear) * 1.6;
      // (turned to its nearer side; both parts from the heading as it was, or dead ahead of a prop
      // the turn overshot to the rear and the AI dithered in front of it)
      const ax = nz * sg * k,
        az = -nx * sg * k;
      nx += ax;
      nz += az;
    }
    const wob = Math.sin(this.clk * 2.1 + i * 1.9) * (1 - s) * 0.32;
    const c = Math.cos(wob),
      sn = Math.sin(wob);
    dx = nx * c - nz * sn;
    dz = nx * sn + nz * c;
    const l = Math.hypot(dx, dz) || 1;
    let sf = 0.8 + 0.17 * s;
    // (no need to sprint to a coin that is still falling: get under it)
    if (coinish && d < 0.6) sf *= Math.max(0.3, d / 0.6);
    // (on the ice, ease off before getting there: a pro brakes in time)
    if (this.L.ice && this.onIce(p.x, p.z)) sf *= clamp(d / (1.5 + 0.6 * s), 0.35, 1);
    this.mx = (dx / l) * sf;
    this.mz = (dz / l) * sf;
  }

  // ---- coins and bombs ---------------------------------------------------------------------------

  private pickups() {
    for (let ci = this.coins.length - 1; ci >= 0; ci--) {
      const c = this.coins[ci];
      if (this.t < c.pickAt || c.y - this.floorAt(c.x, c.z) > (c.st === 0 ? 1.7 : 2.0)) continue;
      const R = c.v > 1 ? PICK_BIG : PICK;
      let best = -1,
        bd = R;
      for (let i = 0; i < 4; i++) {
        const r = this.run[i];
        if (r.stun > 0 || (c.owner === i && this.t < c.ownerT)) continue;
        const d = Math.hypot(c.x - r.a.pos.x, c.z - r.a.pos.z);
        if (d < bd) ((bd = d), (best = i));
      }
      if (best >= 0) this.collect(best, ci);
    }
  }

  private collect(i: number, ci: number) {
    const c = this.coins[ci];
    const was = this.score[i];
    for (let k = 1; k <= c.v; k++) if (this.reach[i][was + k] === undefined) this.reach[i][was + k] = this.t;
    this.score[i] += c.v;
    this.bump[i] = 1;
    this.stats.coins++;
    this.stats.seat[i].got += c.v;
    if (c.v > 1) this.stats.bigs++;
    const r = this.run[i];
    r.sq = 1;
    const big = c.v > 1;
    this.fx.burst(this.v.set(c.x, c.y, c.z), big ? 46 : 12, big ? ["#ffd23f", "#fff6c0", "#3e9bff", "#ffffff"] : ["#ffd23f", "#fff4c4", "#ffffff"], { speed: big ? 7 : 3.6, up: big ? 6 : 4, size: big ? 0.22 : 0.14, life: big ? 1 : 0.55, gravity: 9 });
    this.ring(c.x, 0.06, c.z, 0.2, big ? 2.6 : 1.1, big ? 0.5 : 0.3, "#ffd23f", 0.9);
    let sub = "";
    if (isLocal(this.players[i])) {
      this.combo = this.clk - this.lastPick < 0.9 ? Math.min(this.combo + 1, STEPS.length - 1) : 0;
      this.lastPick = this.clk;
      const f = 988 * Math.pow(2, STEPS[this.combo] / 12);
      beep(f, 0.06, "square", 0.22);
      beep(f * 1.335, 0.14, "square", 0.2, 0, 0.055);
      if (this.combo >= 2) sub = `x${this.combo + 1}`;
    } else beep(1600 + i * 120, 0.035, "square", 0.05);
    if (big) {
      sfx.star();
      this.cam.shake(0.18);
      r.a.cheer(0.7);
      if (isLocal(this.players[i])) this.gold = 1;
    }
    this.pop(i, `+${c.v}`, big ? "#7fd0ff" : "#ffd23f", big, sub);
    this.kill(ci);
  }

  /** A number over a head; quick gains add up in the one already there ("+1" then "+2"). */
  private pop(seat: number, s: string, c: string, big = false, sub = "") {
    const v = Number(s);
    for (const p of this.pops)
      if (p.seat === seat && this.clk - p.t0 < 0.5 && v > 0 && Number(p.s) > 0) {
        p.s = `+${Number(p.s) + v}`;
        p.t = this.clk - 0.06;
        p.big ||= big;
        if (big) p.c = c;
        if (sub) p.sub = sub;
        return;
      }
    this.pops.push({ seat, s, c, t: this.clk, t0: this.clk, big, sub });
  }

  private kill(ci: number) {
    const c = this.coins[ci];
    c.dead = true;
    if (c.big) {
      c.big.used = false;
      c.big.g.visible = c.big.beam.visible = c.big.ring.visible = false;
    }
    this.coins[ci] = this.coins[this.coins.length - 1];
    this.coins.pop();
  }

  private tickBombs(dt: number) {
    for (const b of this.bombs) {
      if (!b.used) continue;
      if (!b.landed) {
        b.vy -= 10 * dt;
        b.y += b.vy * dt;
        if (this.wx.wind && this.L.gust) {
          b.x += this.wx.wind * this.L.gust.drift * 0.7 * dt;
          b.x = clamp(b.x, -this.XW + 0.8, this.XW - 0.8);
          if (this.L.round && !this.inside(b.x, b.z, 0.8)) b.x -= this.wx.wind * this.L.gust.drift * 0.7 * dt;
        }
        b.g.rotation.y += dt * 2.5;
        b.g.rotation.z = Math.sin(this.clk * 7 + b.x) * 0.25;
        // the fuse sparks on the way down
        this.fx.burst(this.v.set(b.x, b.y + 1.15, b.z), 1, ["#ffd23f", "#ff7a3c", "#ffffff"], { speed: 1.5, up: 1.5, size: 0.11, life: 0.3, gravity: 3 });
        const fl = this.floorAt(b.x, b.z);
        if (b.y <= fl) {
          b.y = fl;
          b.landed = true;
          b.hv = 3.2;
          b.g.rotation.z = 0;
          this.fx.burst(this.v.set(b.x, fl + 0.2, b.z), 12, this.inWet(b.x, b.z) ? ["#ffffff", "#bfe9ff", "#7fc8ff"] : this.L.dust, { speed: 3.5, up: 1.5, size: 0.2, gravity: 6, life: 0.5, drag: 3 });
          beep(150, 0.14, "triangle", 0.3, 0.5);
          this.cam.shake(0.08);
        }
      } else {
        b.hv -= 26 * dt;
        b.hy += b.hv * dt;
        if (b.hy < 0) ((b.hy = 0), (b.hv = b.hv < -1.5 ? -b.hv * 0.3 : 0));
        // the light blinks faster and faster, the body swells
        const k = clamp((this.t - b.tl) / FUSE, 0, 1);
        b.blink += dt / (0.2 - k * 0.14);
        const on = b.blink % 1 < 0.5;
        if (on && !b.on) beep(1250 + k * 600, 0.04, "square", 0.09);
        b.on = on;
        b.light.material = on ? this.redOn : this.redOff;
        b.light.scale.setScalar(on ? 0.27 : 0.2);
        const sw = 1 + k * 0.14 + (on ? 0.05 : 0);
        b.body.scale.set(sw, sw * (on ? 0.94 : 1), sw);
        b.dmat.opacity = on ? 1 : 0.6;
      }
      b.g.position.set(b.x, b.y + b.hy, b.z);
      if (!b.landed) {
        const k = clamp((this.t - b.t0) / Math.max(0.1, b.tl - b.t0), 0, 1);
        b.dmat.opacity = 0.2 + k * 0.55;
        // (its warning follows it on the wind)
        b.danger.position.set(b.x, this.floorAt(b.x, b.z) + 0.035, b.z);
        const pulse = 1 + Math.sin(this.clk * 10) * 0.03;
        b.danger.scale.set(BLAST * 2 * pulse, BLAST * 2 * pulse, 1);
      }
      if (this.t >= b.boomAt) this.explode(b);
    }
  }

  private explode(b: Bomb) {
    this.stats.bombs++;
    b.used = false;
    b.g.visible = b.danger.visible = false;
    const at = this.v.set(b.x, 0.6, b.z);
    this.fx.burst(at, 50, ["#ff6a2a", "#ffd23f", "#ff3355", "#fff3c0"], { speed: 12, up: 6, size: 0.32, life: 0.75, gravity: 14, drag: 1.4 });
    this.fx.burst(at, 16, ["#ffffff", "#e6e0f0", "#c9c0da"], { speed: 4.5, up: 3.5, size: 0.42, life: 0.9, gravity: -2, drag: 3 });
    this.fx.burst(at, 8, ["#2b2342", "#5b4d80", "#e8304a"], { speed: 9, up: 9, size: 0.14, life: 0.9, gravity: 22 });
    this.flash(b.x, b.z);
    this.ring(b.x, 0.08, b.z, 0.4, BLAST * 1.2, 0.4, "#ffb347", 1);
    this.ring(b.x, 0.08, b.z, 0.2, BLAST * 0.8, 0.28, "#ffffff", 0.8);
    this.scorch.push({ x: b.x, z: b.z, t: this.clk });
    this.wx.boom = true;
    this.wx.boomX = b.x;
    this.wx.boomZ = b.z;
    let near = false;
    for (let i = 0; i < 4; i++) {
      const r = this.run[i];
      const dx = r.a.pos.x - b.x,
        dz = r.a.pos.z - b.z;
      const d = Math.hypot(dx, dz);
      if (i === this.you && d < 7) near = true;
      if (d > BLAST + PR * 0.5 || r.stun > 0 || r.immune > 0) continue;
      this.blown(i, d > 0.05 ? dx / d : Math.sin(i * 2.3), d > 0.05 ? dz / d : Math.cos(i * 2.3));
      if (i === this.you) near = true;
    }
    // the coins on the floor round it fly
    for (const c of this.coins) {
      if (c.st === 0) continue;
      const dx = c.x - b.x,
        dz = c.z - b.z;
      const d = Math.hypot(dx, dz);
      if (d > BLAST || d < 1e-3) continue;
      const k = 4 + (1 - d / BLAST) * 4;
      c.st = 1;
      c.vx = (dx / d) * k;
      c.vz = (dz / d) * k;
      c.vy = 6 + this.rnd() * 2;
    }
    this.cam.shake(near ? 0.6 : 0.32);
    boom(near ? 0.9 : 0.6);
  }

  /** Caught in a blast: flung, spinning, dizzy; three coins fly out. */
  private blown(i: number, nx: number, nz: number) {
    this.stats.blown++;
    this.stats.seat[i].blown++;
    const r = this.run[i],
      a = r.a;
    r.stun = STUN_BOMB;
    r.dash = 0;
    r.rec = 0;
    r.vx = nx * 8.5;
    r.vz = nz * 8.5;
    r.spin = 11 * (this.rnd() < 0.5 ? -1 : 1);
    a.vy = 7.5;
    a.grounded = false;
    a.hit();
    a.body.release();
    r.tgt = null;
    const k = Math.min(DROP, this.score[i]);
    if (k > 0) {
      this.score[i] -= k;
      this.loss[i] = 1;
      const base = Math.atan2(nx, nz);
      for (let j = 0; j < k; j++) {
        const an = base + (j - (k - 1) / 2) * 1.0 + (this.rnd() - 0.5) * 0.4;
        const sp = 3.2 + this.rnd() * 2.4;
        this.fling(a.pos.x, 1.2, a.pos.z, Math.sin(an) * sp, Math.cos(an) * sp, 6.5 + this.rnd() * 2, i, 1.6);
      }
      this.pop(i, `-${k}`, "#ff5a6a", true);
    }
    if (isLocal(this.players[i])) ((this.hurt = 1), sfx.lose());
    if (!this.players[i].human) r.angryT = 1.8;
  }

  // ---- every frame: what moves by itself -----------------------------------------------------------

  private animate(dt: number) {
    const clk = this.clk;
    const marks = this.marks;
    marks.begin();
    // coins
    let n = 0;
    const L = this.coinL;
    for (let ci = this.coins.length - 1; ci >= 0; ci--) {
      const c = this.coins[ci];
      const wind = this.wx.wind && this.L.gust ? this.wx.wind * this.L.gust.drift : 0;
      if (c.st === 0) {
        c.vy -= c.g * dt;
        c.y += c.vy * dt;
        c.ry += 9 * dt;
        if (wind) {
          // (blown sideways on the way down: its shadow slides with it)
          const ox = c.x;
          c.x += wind * (c.v > 1 ? 0.6 : 1) * dt;
          if (!this.inside(c.x, c.z, c.r)) c.x = ox;
          if (c.big) c.big.beam.position.x = c.x;
        }
        const fl = this.floorAt(c.x, c.z);
        if (c.y <= c.r + fl) {
          c.y = c.r + fl;
          c.st = 1;
          c.vy = -c.vy * 0.4;
          c.vx = (this.rnd() - 0.5) * 1.2;
          c.vz = (this.rnd() - 0.5) * 1.2;
          if (c.v > 1) {
            this.ring(c.x, 0.06, c.z, 0.3, 2.2, 0.45, "#ffd23f", 1);
            this.fx.burst(this.v.set(c.x, 0.4, c.z), 26, ["#ffd23f", "#fff6c0", "#3e9bff"], { speed: 5, up: 4, size: 0.18, life: 0.7 });
            this.cam.shake(0.15);
            beep(520, 0.18, "triangle", 0.3, 1.6);
          } else this.fx.burst(this.v.set(c.x, fl + 0.15, c.z), 3, this.inWet(c.x, c.z) ? ["#ffffff", "#bfe9ff"] : this.L.dust, { speed: 1.8, up: 0.8, size: 0.12, gravity: 4, life: 0.35, drag: 3 });
        }
      } else if (c.st === 1) {
        c.vy -= 20 * dt;
        c.vx += wind * 1.5 * dt;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.z += c.vz * dt;
        c.ry += 13 * dt;
        this.bounceCoin(c);
        const fl = this.floorAt(c.x, c.z);
        if (c.y <= c.r + fl) {
          c.y = c.r + fl;
          if (c.vy < -1.8) {
            // (on the ice it skids on)
            const k = this.onIce(c.x, c.z) ? 0.88 : 0.6;
            c.vy = -c.vy * 0.42;
            c.vx *= k;
            c.vz *= k;
          } else ((c.st = 2), (c.vy = 0), (c.age = 0));
        }
      } else {
        c.age += dt;
        c.ry += 2.8 * dt;
        // the gust slides the coins over the wet deck (the big one is heavier)
        if (wind) {
          c.x += wind * (c.v > 1 ? 0.3 : 0.55) * dt;
          c.ry += wind * 3 * dt;
          this.bounceCoin(c);
        }
        const hover = (c.v > 1 ? 0.95 : 0.5) + this.floorAt(c.x, c.z);
        c.y += (hover + Math.sin(clk * 3 + c.ph) * 0.07 - c.y) * Math.min(1, 7 * dt);
        if (c.age > c.life) {
          this.fx.burst(this.v.set(c.x, c.y, c.z), 6, ["#fff4c4", "#ffffff"], { speed: 2, up: 1.5, size: 0.12, life: 0.4, gravity: 2 });
          this.kill(ci);
          continue;
        }
      }
      // its shadow
      const cf = this.floorAt(c.x, c.z);
      const hgt = c.y - c.r - cf;
      if (c.st === 0) {
        const k = clamp(1 - hgt / 13, 0, 1);
        marks.add(c.x, c.z, c.r * (0.45 + 0.6 * k), 0.12 + 0.43 * k, 0.4, cf);
      } else marks.add(c.x, c.z, c.r * (1.05 - Math.min(0.4, hgt * 0.12)), 0.48, 0.35, cf);
      // blink in its last second and a half
      const fading = c.st === 2 && c.life - c.age < 1.5 && Math.floor(clk * 12) % 2 === 0;
      if (c.big) {
        const B = c.big;
        B.g.visible = !fading;
        B.g.position.set(c.x, c.y, c.z);
        B.g.rotation.y = c.ry;
        B.halo.scale.setScalar(2.6 + Math.sin(clk * 6) * 0.3);
        B.beam.visible = c.st === 0;
        B.beamMat.opacity = 0.13 + Math.sin(clk * 9) * 0.05;
        B.ring.position.set(c.x, cf + 0.05, c.z);
        B.ring.scale.setScalar(2.4 + Math.sin(clk * 5) * 0.2);
        B.ringMat.opacity = c.st === 0 ? 0.85 : 0.5;
        if (Math.random() < (c.st === 0 ? 0.9 : 0.25)) this.fx.burst(this.v.set(c.x + (Math.random() - 0.5) * 0.8, c.y + (Math.random() - 0.5) * 0.8, c.z), 1, ["#fff6c0", "#ffd23f", "#7fd8ff", "#ffffff"], { speed: 0.6, up: 0.4, gravity: c.st === 0 ? -2 : 1, size: 0.13, life: 0.7 });
        continue;
      }
      if (fading || n >= COIN_CAP) continue;
      // (a little wobble on its spin while it bounces)
      this.E.set(c.st === 1 ? Math.sin(c.ry * 0.7) * 0.5 : 0, c.ry, 0, "YXZ");
      this.Q.setFromEuler(this.E);
      const sc = c.st === 2 && c.age < 0.2 ? 1 + Math.sin((c.age / 0.2) * Math.PI) * 0.25 : 1;
      this.M.compose(this.P.set(c.x, c.y, c.z), this.Q, this.S.set(sc, sc, sc)).multiply(L);
      this.coinMesh.setMatrixAt(n++, this.M);
    }
    this.coinMesh.count = n;
    this.coinMesh.instanceMatrix.needsUpdate = true;
    // the bombs' shadows
    for (const b of this.bombs) {
      if (!b.used) continue;
      const bf = this.floorAt(b.x, b.z);
      const k = b.landed ? 1 : clamp(1 - (b.y - bf) / 14, 0, 1);
      marks.add(b.x, b.z, 0.3 + 0.32 * k, 0.15 + 0.45 * k, 0.35, bf);
    }
    // the scorches fade
    for (let i = this.scorch.length - 1; i >= 0; i--) {
      const s = this.scorch[i];
      const k = (clk - s.t) / 3.5;
      if (k >= 1) {
        this.scorch.splice(i, 1);
        continue;
      }
      marks.add(s.x, s.z, BLAST * 0.75, 0.55 * (1 - k), 0.9, this.floorAt(s.x, s.z));
    }
    marks.end();
    // the rings, the flashes
    for (const r of this.rings) {
      if (!r.on) continue;
      r.t += dt;
      const k = r.t / r.dur;
      if (k >= 1) {
        r.on = r.m.visible = false;
        continue;
      }
      const e = 1 - Math.pow(1 - k, 3);
      r.m.scale.setScalar((r.r0 + (r.r1 - r.r0) * e) * 2);
      r.mat.opacity = r.a0 * (1 - k);
    }
    for (const f of this.flashes) {
      if (!f.on) continue;
      f.t += dt;
      const k = f.t / 0.32;
      if (k >= 1) {
        f.on = f.m.visible = false;
        continue;
      }
      f.m.scale.setScalar(1 + k * BLAST * 1.9);
      f.mat.opacity = 1 - k;
      f.mat.color.setRGB(1, 0.75 - k * 0.4, 0.35 - k * 0.3);
    }
    // the set: the level's own moving bits (a fountain, palms in the gust, rain, snow)
    this.setAnim?.(dt, clk, this.wx);
    this.wx.boom = false;
    this.fx.update(dt);
  }

  private bounceCoin(c: Coin) {
    const m = c.r * 0.8;
    if (this.L.round) {
      const d = Math.hypot(c.x, c.z),
        lr = this.XW - m;
      if (d > lr) {
        const nx = c.x / d,
          nz = c.z / d;
        c.x = nx * lr;
        c.z = nz * lr;
        const vn = c.vx * nx + c.vz * nz;
        if (vn > 0) ((c.vx -= 1.5 * vn * nx), (c.vz -= 1.5 * vn * nz));
      }
    } else {
      if (Math.abs(c.x) > this.XW - m) ((c.x = Math.sign(c.x) * (this.XW - m)), (c.vx *= -0.5));
      if (Math.abs(c.z) > this.ZD - m) ((c.z = Math.sign(c.z) * (this.ZD - m)), (c.vz *= -0.5));
    }
    for (const o of this.circles) {
      const dx = c.x - o.x,
        dz = c.z - o.z;
      const d = Math.hypot(dx, dz),
        mm = o.r + m;
      if (d < mm && d > 1e-4) {
        const nx = dx / d,
          nz = dz / d;
        c.x = o.x + nx * mm;
        c.z = o.z + nz * mm;
        const vn = c.vx * nx + c.vz * nz;
        if (vn < 0) ((c.vx -= 1.6 * vn * nx), (c.vz -= 1.6 * vn * nz));
      }
    }
    for (const b of this.boxes)
      if (Math.abs(c.x - b.x) < b.hx + m && Math.abs(c.z - b.z) < b.hz + m) {
        const ox = b.hx + m - Math.abs(c.x - b.x),
          oz = b.hz + m - Math.abs(c.z - b.z);
        if (ox < oz) ((c.x += Math.sign(c.x - b.x) * ox), (c.vx *= -0.5));
        else ((c.z += Math.sign(c.z - b.z) * oz), (c.vz *= -0.5));
      }
  }

  // ---- the HUD -----------------------------------------------------------------------------------

  view() {
    return this.w;
  }

  draw(g: CanvasRenderingContext2D) {
    if (this.phase === "card") return;
    const cam = this.w.camera;
    // the edges flash: red when you are hit, gold for a big coin
    if (this.hurt > 0 || this.gold > 0) {
      const red = this.hurt >= this.gold;
      const k = red ? this.hurt : this.gold;
      const gr = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62);
      gr.addColorStop(0, "rgba(0,0,0,0)");
      gr.addColorStop(1, red ? `rgba(255,40,60,${0.45 * k})` : `rgba(255,214,70,${0.4 * k})`);
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
    }
    // the rivals' tags (yours comes last, over the panels: in a back corner a phone's stacked panels would hide it)
    for (const r of this.run) {
      if (isLocal(r.a.player)) continue;
      const s = toScreen(r.a.head(this.v), cam);
      if (s.on) tag(g, r.a.player, s.x, s.y);
    }
    // the floating numbers over the heads
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      const k = (this.clk - p.t) / 0.95;
      if (k >= 1) {
        this.pops.splice(i, 1);
        continue;
      }
      const s = toScreen(this.run[p.seat].a.head(this.v), cam);
      const sc = backOut(Math.min(1, k * 4));
      g.globalAlpha = k > 0.6 ? (1 - k) / 0.4 : 1;
      const y = s.y - 26 - k * 38;
      shout(g, p.s, s.x, y, (p.big ? 34 : 24) * sc, p.c);
      if (p.sub) shout(g, p.sub, s.x + (p.big ? 44 : 34), y + 4, 15 * sc, "#ffffff");
      g.globalAlpha = 1;
    }
    this.panels(g);
    if (this.you >= 0) {
      const s = toScreen(this.run[this.you].a.head(this.v), cam);
      if (s.on) tag(g, this.run[this.you].a.player, s.x, s.y);
    }
    clock(g, TIME - this.t);
    for (let i = this.banners.length - 1; i >= 0; i--) if ((this.clk - this.banners[i].t) / this.banners[i].dur >= 1) this.banners.splice(i, 1);
    // (high, over the back wall: the floor under it stays readable while the coins fall; two at once,
    // a gust and a big coin: the later one under the first; a phone's stacked panels leave the middle)
    for (let i = 0; i < this.banners.length; i++) {
      const b = this.banners[i];
      banner(g, b.s, (this.clk - b.t) / b.dur, b.c, (HUD.thumbs ? 122 : 112) + i * 60, Math.min(b.size, 50));
    }
  }

  /**
   * The four corners, the party's own panels (k3 corners(): they grow on a phone and stack clear of
   * the thumbs): the coin count (it pops gold on a gain, red on a loss), the place under the name, a
   * crown on whoever leads.
   */
  private panels(g: CanvasRenderingContext2D) {
    let lead = 0;
    for (const v of this.score) lead = Math.max(lead, v);
    this.leads.length = 0;
    for (let i = 0; i < 4; i++) {
      // its place: how many are ahead (more coins; the same count reached sooner; then the lower seat)
      let place = 0;
      if (this.over) place = this.over.indexOf(i);
      else {
        const ti = this.reach[i][this.score[i]] ?? 0;
        for (let j = 0; j < 4; j++) {
          if (j === i) continue;
          const tj = this.reach[j][this.score[j]] ?? 0;
          if (this.score[j] > this.score[i] || (this.score[j] === this.score[i] && (tj < ti || (tj === ti && j < i)))) place++;
        }
      }
      this.vals[i] = String(this.score[i]);
      this.subs[i] = lead > 0 ? ord(place) : "";
      if (lead > 0 && this.score[i] === lead) this.leads.push(i);
    }
    corners(g, this.players, this.vals, { lead: this.leads, sub: this.subs });
  }

  result() {
    return this.over;
  }

  /** Online: the sim's state for the desync check (the players, the coins, the bombs, the scores, the clocks). */
  hash() {
    const h = new Hasher().num(this.t).num(this.clk).bool(!!this.over).num(this.waveAt).num(this.rainAt).num(this.bombAt).int(this.bigI).int(this.pending.length);
    h.int(this.gustPh).num(this.gustT).num(this.gustAt).int(this.thawPh).num(this.thawT).num(this.thawAt).num(this.wx.wind);
    for (let i = 0; i < 4; i++) {
      const r = this.run[i],
        p = r.a.pos;
      h.int(this.score[i]).num(p.x).num(p.y).num(p.z).num(r.vx).num(r.vz).num(r.a.vy).num(r.a.yaw).bool(r.a.grounded);
      h.num(r.dash).num(r.cd).num(r.rec).num(r.stun).num(r.immune).num(r.think).num(r.tx).num(r.tz).int(r.tgt ? this.coins.indexOf(r.tgt) : -2);
    }
    h.int(this.coins.length);
    for (const c of this.coins) h.num(c.x).num(c.y).num(c.z).num(c.vx).num(c.vy).num(c.vz).int(c.st).int(c.v).num(c.age);
    for (const b of this.bombs) if (b.used) h.num(b.x).num(b.y).num(b.z).num(b.boomAt).bool(b.landed);
    return h.value;
  }

  dispose() {
    for (const r of this.run) r.a.dispose();
    this.w.scene.traverse((o) => (o as THREE.InstancedMesh).isInstancedMesh && (o as THREE.InstancedMesh).dispose());
    disposeScene(this.w.scene);
  }
}

export const COINS: MiniDef = {
  key: "coins",
  title: "ⓩ SHOWER",
  titleZh: "ⓩ 币雨",
  tag: "It's raining ⓩ coins on the plaza. Grab them all!",
  tagZh: "广场下起了ⓩ币雨，统统抢到手！",
  help: "Run under the shadows to catch coins (a big one is 5). Dodge the rug bombs: they cost 3. Dive into a rival to knock a coin out.",
  helpZh: "跑到影子下接金币（大金币值 5）。躲开地毯炸弹：被炸掉 3 枚。飞扑撞向对手，撞掉一枚金币。",
  pad: ["left", "right", "up", "down", "a"],
  tap: false,
  color: "#ffd23f",
  song: "bouncy",
  ambience: "city-day",
  variants: COIN_LEVELS.map((l) => ({ key: l.key, title: l.title, titleZh: l.titleZh, tag: l.tag, tagZh: l.tagZh, thumb: `coins-${l.key}`, ...(l.song ? { song: l.song } : {}), ambience: l.ambience })),
  make: (players, rnd, variant) => new Shower(players, rnd, COIN_LEVELS.find((l) => l.key === variant) ?? COIN_LEVELS[Math.floor(rnd() * COIN_LEVELS.length) % COIN_LEVELS.length]),
};
export default COINS;
